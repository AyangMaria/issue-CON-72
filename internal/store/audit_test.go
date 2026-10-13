package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/consize-oss/consize/internal/audit"
)

func auditEvent(id, key, correlation string, at time.Time) audit.Event {
	return audit.Event{
		ID: id, IdempotencyKey: key, Type: "action.completed", Family: audit.FamilyAction,
		Kind: audit.KindOutcome, SchemaVersion: audit.SchemaVersion, Timestamp: at, RecordedAt: at,
		Actor: audit.Actor{Type: "service", ID: "worker"}, Source: "worker", CorrelationID: correlation,
		Result: audit.ResultSucceeded, Severity: audit.SeverityInfo, Visibility: audit.VisibilitySummary,
		ReasonCode: "action_complete", Summary: "Action completed", Details: map[string]any{},
	}
}

func TestAuditIdempotencyAndConflict(t *testing.T) {
	st := NewMemory()
	now := time.Now().UTC()
	first := auditEvent("event-1", "same-key", "flow-1", now)
	if _, err := st.AppendAuditEvent(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	retry := first
	retry.ID = "event-2"
	retry.RecordedAt = now.Add(time.Second)
	retry.Timestamp = now.Add(time.Second)
	got, err := st.AppendAuditEvent(context.Background(), retry)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != first.ID {
		t.Fatalf("retry created %q instead of returning %q", got.ID, first.ID)
	}
	retry.Summary = "Different operation"
	if _, err := st.AppendAuditEvent(context.Background(), retry); err == nil {
		t.Fatal("conflicting reuse was accepted")
	}
}

func TestAuditPaginationStableDuringConcurrentAppend(t *testing.T) {
	st := NewMemory()
	base := time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)
	for i, id := range []string{"a", "b", "c"} {
		if _, err := st.AppendAuditEvent(context.Background(), auditEvent(id, id, "flow", base.Add(time.Duration(i)*time.Second))); err != nil {
			t.Fatal(err)
		}
	}
	first, err := st.QueryAuditEvents(context.Background(), audit.Query{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Events) != 2 || first.NextCursor == "" {
		t.Fatalf("unexpected first page: %#v", first)
	}
	if _, err := st.AppendAuditEvent(context.Background(), auditEvent("late", "late", "flow", base.Add(4*time.Second))); err != nil {
		t.Fatal(err)
	}
	second, err := st.QueryAuditEvents(context.Background(), audit.Query{Limit: 2, After: first.NextCursor})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Events) != 1 || second.Events[0].ID != "c" {
		t.Fatalf("unstable second page: %#v", second.Events)
	}
}

func TestAuditRestartRetentionAndIntegrity(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	st, err := OpenDurable(path)
	if err != nil {
		t.Fatal(err)
	}
	base := time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)
	root := auditEvent("root", "root", "active-flow", base)
	root.Workflow.RecommendationID = "1"
	child := auditEvent("child", "child", "active-flow", base.Add(time.Second))
	child.CausationID = root.ID
	if _, err = st.AppendAuditEvent(context.Background(), root); err != nil {
		t.Fatal(err)
	}
	if _, err = st.AppendAuditEvent(context.Background(), child); err != nil {
		t.Fatal(err)
	}
	if err = st.Close(); err != nil {
		t.Fatal(err)
	}
	st, err = OpenDurable(path)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	st.recs[1] = Recommendation{ID: 1, Status: RecommendationPending}
	page, err := st.QueryAuditEvents(context.Background(), audit.Query{CorrelationID: "active-flow", Limit: 10})
	if err != nil || len(page.Events) != 2 || page.Events[0].ID != "root" || page.Events[1].ID != "child" {
		t.Fatalf("restart lost ordering: %#v, %v", page.Events, err)
	}
	if report := st.CheckAuditIntegrity(context.Background()); !report.Valid {
		t.Fatalf("integrity failed: %#v", report)
	}
	removed, err := st.CleanupAuditEvents(context.Background(), base.Add(2*time.Second), nil)
	if err != nil || removed != 0 {
		t.Fatalf("active flow was removed: %d, %v", removed, err)
	}
	st.recs[1] = Recommendation{ID: 1, Status: RecommendationVerified}
	removed, err = st.CleanupAuditEvents(context.Background(), base.Add(2*time.Second), nil)
	if err != nil || removed != 2 {
		t.Fatalf("cleanup = %d, %v", removed, err)
	}
}

func TestAuditIntegrityFindsMissingCausation(t *testing.T) {
	st := NewMemory()
	e := auditEvent("child", "child", "flow", time.Now().UTC())
	e.CausationID = "missing"
	if _, err := st.AppendAuditEvent(context.Background(), e); err != nil {
		t.Fatal(err)
	}
	report := st.CheckAuditIntegrity(context.Background())
	if report.Valid || len(report.MissingCausationLinks) != 1 {
		t.Fatalf("unexpected integrity report: %#v", report)
	}
}

func TestActionAndCanonicalAuditRollbackTogether(t *testing.T) {
	st := NewMemory()
	st.path = filepath.Join(t.TempDir(), "missing", "state.json")
	st.recs[1] = Recommendation{ID: 1}
	st.actionRecords[1] = Action{ID: 1, RecommendationID: 1}
	_, err := st.CreateActionEvent(context.Background(), ActionEvent{ActionID: 1, RecommendationID: 1, ResourceID: "resource-1", PluginID: "plugin", ActionType: "resize", Actor: "operator", Result: string(ActionRequested)})
	if err == nil {
		t.Fatal("persistence failure was ignored")
	}
	if len(st.actions) != 0 || len(st.auditEvents) != 0 || st.nextEventID != 1 {
		t.Fatalf("partial audit state survived failed transaction: actions=%d audit=%d next=%d", len(st.actions), len(st.auditEvents), st.nextEventID)
	}
}

func TestAuditEventsSurviveBackupAndRestore(t *testing.T) {
	dir := t.TempDir()
	path, backup, restored := filepath.Join(dir, "state.json"), filepath.Join(dir, "backup.json"), filepath.Join(dir, "restored.json")
	st, err := OpenDurable(path)
	if err != nil {
		t.Fatal(err)
	}
	event := auditEvent("backup-event", "backup-event", "backup-flow", time.Now().UTC())
	if _, err = st.AppendAuditEvent(context.Background(), event); err != nil {
		t.Fatal(err)
	}
	if err = st.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err = BackupDurable(path, backup); err != nil {
		t.Fatal(err)
	}
	if _, err = RestoreDurable(restored, backup); err != nil {
		t.Fatal(err)
	}
	restoredStore, err := OpenDurable(restored)
	if err != nil {
		t.Fatal(err)
	}
	defer restoredStore.Close()
	page, err := restoredStore.QueryAuditEvents(context.Background(), audit.Query{CorrelationID: "backup-flow"})
	if err != nil || len(page.Events) != 1 || page.Events[0].ID != event.ID {
		t.Fatalf("restored audit events = %#v, %v", page.Events, err)
	}
}

func TestActionAuditClassifiesWorkerVerificationAndRollback(t *testing.T) {
	for state, want := range map[string]audit.Family{"applying": audit.FamilyWorker, "verifying": audit.FamilyVerification, "rolled_back": audit.FamilyRollback} {
		event := canonicalActionAudit(ActionEvent{ID: 1, ActionID: 1, RecommendationID: 1, ResourceID: "resource", PluginID: "plugin", Actor: "worker", Result: state, CreatedAt: time.Now().UTC()}, "flow", "")
		if event.Family != want {
			t.Fatalf("state %q family = %q, want %q", state, event.Family, want)
		}
		if err := event.Validate(); err != nil {
			t.Fatalf("state %q invalid: %v", state, err)
		}
	}
}
