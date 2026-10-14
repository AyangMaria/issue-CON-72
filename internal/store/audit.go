package store

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/consize-oss/consize/internal/audit"
)

func canonicalActionAudit(event ActionEvent, correlationID, previousID string) audit.Event {
	result := audit.ResultPending
	kind := audit.KindObservation
	visibility := audit.VisibilityDetail
	family := audit.FamilyAction
	typePrefix := "action"
	switch event.Result {
	case string(ActionRequested):
		result, kind = audit.ResultRequested, audit.KindCommand
	case string(ActionPlanned), string(ActionApproved):
		result, kind = audit.ResultAllowed, audit.KindDecision
	case string(ActionSucceeded), "verified", "rolled_back":
		result, kind, visibility = audit.ResultSucceeded, audit.KindOutcome, audit.VisibilitySummary
	case string(ActionFailed), "manual_intervention":
		result, kind, visibility = audit.ResultFailed, audit.KindOutcome, audit.VisibilitySummary
	case string(ActionExecuting), "waiting_rollout":
		result, kind, family, typePrefix = audit.ResultPending, audit.KindProviderEffect, audit.FamilyWorker, "worker"
	}
	if event.Result == "applying" || event.Result == "prepared" || strings.HasPrefix(event.Result, "retry") {
		family, typePrefix = audit.FamilyWorker, "worker"
	}
	if event.Result == "verifying" || event.Result == "verified" {
		family, typePrefix = audit.FamilyVerification, "verification"
	}
	if event.Result == "rollback_pending" || event.Result == "rolling_back" || event.Result == "rollback_verifying" || event.Result == "rolled_back" {
		family, typePrefix = audit.FamilyRollback, "rollback"
	}
	typePart := strings.ReplaceAll(strings.ToLower(event.Result), "_", ".")
	if typePart == "" {
		typePart = "observed"
	}
	id := fmt.Sprintf("action-event-%d", event.ID)
	return audit.Event{
		ID: id, IdempotencyKey: id, Type: typePrefix + "." + typePart,
		Family: family, Kind: kind, SchemaVersion: audit.SchemaVersion,
		Timestamp: event.CreatedAt, RecordedAt: event.CreatedAt,
		Actor: audit.Actor{Type: "actor", ID: event.Actor}, Source: "action-store",
		Resource: &audit.ResourceRef{ID: event.ResourceID}, CorrelationID: correlationID,
		CausationID: previousID,
		Workflow:    audit.WorkflowRefs{RecommendationID: strconv.FormatInt(event.RecommendationID, 10), ActionID: strconv.FormatInt(event.ActionID, 10), PluginID: event.PluginID},
		Result:      result, Severity: audit.SeverityInfo, Visibility: visibility,
		ReasonCode: "action_state_changed", Summary: "Action workflow state changed",
		Details: map[string]any{"status": event.Result, "mode": event.Mode, "operation": event.ActionType},
	}
}

func (m *Memory) AppendAuditEvent(_ context.Context, event audit.Event) (audit.Event, error) {
	if err := event.Validate(); err != nil {
		return audit.Event{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if id, ok := m.auditIdempotencyIndex[event.IdempotencyKey]; ok {
		existing := m.auditEvents[id]
		if !audit.SameLogicalEvent(existing, event) {
			return audit.Event{}, errors.New("audit idempotency key reused for different event")
		}
		return clone(existing), nil
	}
	if _, exists := m.auditEvents[event.ID]; exists {
		return audit.Event{}, errors.New("duplicate audit event id")
	}
	m.auditEvents[event.ID] = clone(event)
	m.auditIdempotencyIndex[event.IdempotencyKey] = event.ID
	if err := m.persistLocked(); err != nil {
		delete(m.auditEvents, event.ID)
		delete(m.auditIdempotencyIndex, event.IdempotencyKey)
		return audit.Event{}, err
	}
	return clone(event), nil
}

func (m *Memory) QueryAuditEvents(_ context.Context, query audit.Query) (audit.Page, error) {
	if err := query.Validate(); err != nil {
		return audit.Page{}, err
	}
	cursor, err := audit.DecodeCursor(query.After)
	if err != nil {
		return audit.Page{}, err
	}
	if query.Limit <= 0 {
		query.Limit = 100
	}
	if query.Limit > 500 {
		query.Limit = 500
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	events := make([]audit.Event, 0, len(m.auditEvents))
	for _, e := range m.auditEvents {
		if !matchesAudit(e, query) {
			continue
		}
		if !cursor.RecordedAt.IsZero() && (e.RecordedAt.Before(cursor.RecordedAt) || (e.RecordedAt.Equal(cursor.RecordedAt) && e.ID <= cursor.ID)) {
			continue
		}
		if !cursor.SnapshotAt.IsZero() && (e.RecordedAt.After(cursor.SnapshotAt) || (e.RecordedAt.Equal(cursor.SnapshotAt) && e.ID > cursor.SnapshotID)) {
			continue
		}
		events = append(events, clone(e))
	}
	sort.Slice(events, func(i, j int) bool {
		if events[i].RecordedAt.Equal(events[j].RecordedAt) {
			return events[i].ID < events[j].ID
		}
		return events[i].RecordedAt.Before(events[j].RecordedAt)
	})
	page := audit.Page{}
	if len(events) > query.Limit {
		snapshot := events[len(events)-1]
		if !cursor.SnapshotAt.IsZero() {
			snapshot.RecordedAt, snapshot.ID = cursor.SnapshotAt, cursor.SnapshotID
		}
		last := events[query.Limit-1]
		page.NextCursor = audit.EncodeCursor(audit.Cursor{RecordedAt: last.RecordedAt, ID: last.ID, SnapshotAt: snapshot.RecordedAt, SnapshotID: snapshot.ID})
		events = events[:query.Limit]
	}
	page.Events = events
	return page, nil
}
func matchesAudit(e audit.Event, q audit.Query) bool {
	if q.ResourceID != "" && (e.Resource == nil || e.Resource.ID != q.ResourceID) {
		return false
	}
	if q.WorkflowID != "" && !workflowContains(e.Workflow, q.WorkflowID) {
		return false
	}
	if q.CorrelationID != "" && e.CorrelationID != q.CorrelationID {
		return false
	}
	if q.Family != "" && string(e.Family) != q.Family {
		return false
	}
	if q.Result != "" && string(e.Result) != q.Result {
		return false
	}
	if q.Severity != "" && string(e.Severity) != q.Severity {
		return false
	}
	if q.ActorID != "" && e.Actor.ID != q.ActorID {
		return false
	}
	if q.PluginID != "" && e.Workflow.PluginID != q.PluginID {
		return false
	}
	if !q.From.IsZero() && e.RecordedAt.Before(q.From) {
		return false
	}
	if !q.To.IsZero() && !e.RecordedAt.Before(q.To) {
		return false
	}
	return !q.SummaryOnly || e.Visibility == audit.VisibilitySummary
}

func workflowContains(refs audit.WorkflowRefs, id string) bool {
	return refs.RecommendationID == id || refs.PolicyID == id || refs.PreflightID == id || refs.AuthorizationID == id || refs.ActionID == id || refs.AttemptID == id || refs.PluginID == id || refs.VerificationID == id || refs.RollbackID == id
}
func (m *Memory) AuditHealth(context.Context) audit.Health {
	m.mu.RLock()
	defer m.mu.RUnlock()
	h := audit.Health{Healthy: m.poison == nil}
	if m.poison != nil {
		h.PersistenceFailures = 1
		h.LastError = "audit persistence unavailable"
	}
	return h
}
func (m *Memory) CheckAuditIntegrity(context.Context) audit.IntegrityReport {
	m.mu.RLock()
	defer m.mu.RUnlock()
	r := audit.IntegrityReport{Valid: true}
	ids := map[string]bool{}
	for id, e := range m.auditEvents {
		if ids[id] {
			r.DuplicateIDs = append(r.DuplicateIDs, id)
		}
		ids[id] = true
		if err := e.Validate(); err != nil {
			r.InvalidEvents = append(r.InvalidEvents, id)
		}
		if e.CausationID != "" && !ids[e.CausationID] {
			if _, ok := m.auditEvents[e.CausationID]; !ok {
				r.MissingCausationLinks = append(r.MissingCausationLinks, id)
			}
		}
		if e.Resource != nil {
			if _, ok := m.resources[e.Resource.ID]; !ok {
				r.OrphanedReferences = append(r.OrphanedReferences, id)
			}
		}
	}
	r.Valid = len(r.DuplicateIDs)+len(r.InvalidEvents)+len(r.MissingCausationLinks)+len(r.OrphanedReferences) == 0
	return r
}
func (m *Memory) CleanupAuditEvents(_ context.Context, before time.Time, protected map[string]bool) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	protected = mergeProtected(protected, activeAuditCorrelations(m.auditEvents, m.recs, m.actionRecords, m.jobs))
	removed := map[string]audit.Event{}
	for id, e := range m.auditEvents {
		if !e.RecordedAt.Before(before) || protected[e.CorrelationID] || protected[id] {
			continue
		}
		removed[id] = e
		delete(m.auditEvents, id)
		delete(m.auditIdempotencyIndex, e.IdempotencyKey)
	}
	if err := m.persistLocked(); err != nil {
		for id, e := range removed {
			m.auditEvents[id] = e
			m.auditIdempotencyIndex[e.IdempotencyKey] = id
		}
		return 0, err
	}
	return len(removed), nil
}

func mergeProtected(base, extra map[string]bool) map[string]bool {
	out := make(map[string]bool, len(base)+len(extra))
	for key, value := range base {
		out[key] = value
	}
	for key, value := range extra {
		out[key] = value
	}
	return out
}

func activeAuditCorrelations(events map[string]audit.Event, recommendations map[int64]Recommendation, actions map[int64]Action, jobs map[int64]Job) map[string]bool {
	activeRecommendations := map[string]bool{}
	activeActions := map[string]bool{}
	activeAttempts := map[string]bool{}
	for id, recommendation := range recommendations {
		if !RecommendationTerminal(recommendation.Status) {
			activeRecommendations[strconv.FormatInt(id, 10)] = true
		}
	}
	for id, action := range actions {
		if !ActionTerminal(action.Status) {
			activeActions[strconv.FormatInt(id, 10)] = true
		}
	}
	for id, job := range jobs {
		if !Terminal(job.State) {
			activeAttempts[strconv.FormatInt(id, 10)] = true
		}
	}
	protected := map[string]bool{}
	for _, event := range events {
		if activeRecommendations[event.Workflow.RecommendationID] || activeActions[event.Workflow.ActionID] || activeAttempts[event.Workflow.AttemptID] {
			protected[event.CorrelationID] = true
		}
	}
	return protected
}
