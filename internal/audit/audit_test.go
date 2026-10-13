package audit

import (
	"context"
	"strings"
	"testing"
	"time"
)

type captureStore struct{ event Event }

func (s *captureStore) AppendAuditEvent(_ context.Context, event Event) (Event, error) {
	s.event = event
	return event, nil
}
func (*captureStore) QueryAuditEvents(context.Context, Query) (Page, error) { return Page{}, nil }
func (*captureStore) AuditHealth(context.Context) Health                    { return Health{Healthy: true} }
func (*captureStore) CheckAuditIntegrity(context.Context) IntegrityReport {
	return IntegrityReport{Valid: true}
}
func (*captureStore) CleanupAuditEvents(context.Context, time.Time, map[string]bool) (int, error) {
	return 0, nil
}

func validInput() Input {
	return Input{
		IdempotencyKey: "discovery:run-1:completed", Type: "discovery.completed",
		Family: FamilyDiscovery, Kind: KindOutcome, Actor: Actor{Type: "service", ID: "api"},
		Source: "api", CorrelationID: "run-1", Result: ResultSucceeded,
		Severity: SeverityInfo, Visibility: VisibilitySummary, ReasonCode: "discovery_complete",
		Summary: "Discovery completed",
	}
}

func TestWriterBuildsValidBoundedEvent(t *testing.T) {
	store := &captureStore{}
	w := NewWriter(store)
	w.now = func() time.Time { return time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC) }
	in := validInput()
	in.Details = map[string]any{
		"operation":     "sync",
		"labels":        map[string]any{"team": "platform", "api_token": "do-not-store"},
		"error_message": "upstream returned Bearer abc.def.ghi",
	}
	event, err := w.Append(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if !event.Redaction.Applied || event.Details["error_message"] != "[REDACTED]" {
		t.Fatalf("sensitive values were not redacted: %#v", event)
	}
	labels := event.Details["labels"].(map[string]any)
	if labels["api_token"] != "[REDACTED]" {
		t.Fatalf("nested secret was not redacted: %#v", labels)
	}
	if event.Timestamp != event.RecordedAt {
		t.Fatal("missing source timestamp did not use persistence time")
	}
	if err := event.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestDetailsRejectUnknownFieldsAndTruncate(t *testing.T) {
	if _, _, err := SanitizeDetails(map[string]any{"provider_payload": "unsafe"}, 1024); err == nil {
		t.Fatal("unknown plugin field was accepted")
	}
	details, meta, err := SanitizeDetails(map[string]any{"reason": strings.Repeat("x", 100)}, 20)
	if err != nil {
		t.Fatal(err)
	}
	if !meta.Truncated || details["error_code"] != "details_truncated" || meta.OriginalBytes <= 20 {
		t.Fatalf("unexpected truncation result: %#v %#v", details, meta)
	}
}

func TestURLCredentialsAndQueryAreRemoved(t *testing.T) {
	details, meta, err := SanitizeDetails(map[string]any{"url": "https://user:password@example.test/path?token=secret#fragment"}, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if details["url"] != "https://example.test/path" || !meta.Applied {
		t.Fatalf("unsafe URL was retained: %#v %#v", details, meta)
	}
}

func TestTypedPluginPayloadReceivesRecursiveRedaction(t *testing.T) {
	type pluginDetail struct {
		Token  string            `json:"token"`
		Labels map[string]string `json:"labels"`
	}
	details, meta, err := SanitizeDetails(map[string]any{"annotations": pluginDetail{Token: "secret", Labels: map[string]string{"authorization": "Bearer abc.def.ghi"}}}, 1024)
	if err != nil {
		t.Fatal(err)
	}
	annotation := details["annotations"].(map[string]any)
	labels := annotation["labels"].(map[string]any)
	if annotation["token"] != "[REDACTED]" || labels["authorization"] != "[REDACTED]" || !meta.Applied {
		t.Fatalf("typed payload bypassed redaction: %#v %#v", details, meta)
	}
}

func TestValidationRejectsUnknownTaxonomy(t *testing.T) {
	store := &captureStore{}
	in := validInput()
	in.Result = "maybe"
	if _, err := NewWriter(store).Append(context.Background(), in); err == nil {
		t.Fatal("unknown result was accepted")
	}
}

func TestCursorRoundTripAndRejection(t *testing.T) {
	want := Cursor{RecordedAt: time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC), ID: "event-1", SnapshotAt: time.Date(2026, 10, 13, 13, 0, 0, 0, time.UTC), SnapshotID: "event-9"}
	raw := EncodeCursor(want)
	got, err := DecodeCursor(raw)
	if err != nil || got != want {
		t.Fatalf("cursor round trip = %#v, %v", got, err)
	}
	if _, err := DecodeCursor("not-a-cursor"); err == nil {
		t.Fatal("invalid cursor accepted")
	}
}

func TestQueryValidationRejectsUnknownEnums(t *testing.T) {
	for _, query := range []Query{{Family: "unknown"}, {Result: "maybe"}, {Severity: "urgent"}, {Limit: 501}} {
		if err := query.Validate(); err == nil {
			t.Fatalf("invalid query accepted: %#v", query)
		}
	}
}
