package store

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/consize-oss/consize/internal/audit"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) AppendAuditEvent(ctx context.Context, event audit.Event) (audit.Event, error) {
	if err := event.Validate(); err != nil {
		return audit.Event{}, err
	}
	payload, err := marshal(event)
	if err != nil {
		return audit.Event{}, err
	}
	var resourceID any
	if event.Resource != nil {
		resourceID = event.Resource.ID
	}
	var existing []byte
	err = p.pool.QueryRow(ctx, `INSERT INTO audit_events(id,idempotency_key,event_type,family,result,severity,visibility,resource_id,actor_id,plugin_id,workflow_ids,correlation_id,causation_id,event_time,recorded_at,payload)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),$11,$12,NULLIF($13,''),$14,$15,$16)
ON CONFLICT(idempotency_key) DO NOTHING RETURNING payload`, event.ID, event.IdempotencyKey, event.Type, event.Family, event.Result, event.Severity, event.Visibility, resourceID, event.Actor.ID, event.Workflow.PluginID, workflowIDs(event.Workflow), event.CorrelationID, event.CausationID, event.Timestamp, event.RecordedAt, payload).Scan(&existing)
	if errors.Is(err, pgx.ErrNoRows) {
		if err = p.pool.QueryRow(ctx, `SELECT payload FROM audit_events WHERE idempotency_key=$1`, event.IdempotencyKey).Scan(&existing); err != nil {
			return audit.Event{}, err
		}
		prior, e := decode[audit.Event](existing)
		if e != nil {
			return audit.Event{}, e
		}
		if !audit.SameLogicalEvent(prior, event) {
			return audit.Event{}, errors.New("audit idempotency key reused for different event")
		}
		return prior, nil
	}
	if err != nil {
		return audit.Event{}, err
	}
	return decode[audit.Event](existing)
}

func insertAuditEvent(ctx context.Context, tx pgx.Tx, event audit.Event) error {
	if err := event.Validate(); err != nil {
		return err
	}
	payload, err := marshal(event)
	if err != nil {
		return err
	}
	var resourceID any
	if event.Resource != nil {
		resourceID = event.Resource.ID
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(id,idempotency_key,event_type,family,result,severity,visibility,resource_id,actor_id,plugin_id,workflow_ids,correlation_id,causation_id,event_time,recorded_at,payload)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''),$11,$12,NULLIF($13,''),$14,$15,$16)`, event.ID, event.IdempotencyKey, event.Type, event.Family, event.Result, event.Severity, event.Visibility, resourceID, event.Actor.ID, event.Workflow.PluginID, workflowIDs(event.Workflow), event.CorrelationID, event.CausationID, event.Timestamp, event.RecordedAt, payload)
	return err
}
func (p *Postgres) QueryAuditEvents(ctx context.Context, q audit.Query) (audit.Page, error) {
	if err := q.Validate(); err != nil {
		return audit.Page{}, err
	}
	cursor, err := audit.DecodeCursor(q.After)
	if err != nil {
		return audit.Page{}, err
	}
	if q.Limit <= 0 {
		q.Limit = 100
	}
	if q.Limit > 500 {
		q.Limit = 500
	}
	conditions := []string{"TRUE"}
	args := []any{}
	add := func(clause string, value any) {
		args = append(args, value)
		conditions = append(conditions, fmt.Sprintf(clause, len(args)))
	}
	if q.ResourceID != "" {
		add("resource_id=$%d", q.ResourceID)
	}
	if q.WorkflowID != "" {
		add("$%d=ANY(workflow_ids)", q.WorkflowID)
	}
	if q.CorrelationID != "" {
		add("correlation_id=$%d", q.CorrelationID)
	}
	if q.Family != "" {
		add("family=$%d", q.Family)
	}
	if q.Result != "" {
		add("result=$%d", q.Result)
	}
	if q.Severity != "" {
		add("severity=$%d", q.Severity)
	}
	if q.ActorID != "" {
		add("actor_id=$%d", q.ActorID)
	}
	if q.PluginID != "" {
		add("plugin_id=$%d", q.PluginID)
	}
	if !q.From.IsZero() {
		add("recorded_at >= $%d", q.From)
	}
	if !q.To.IsZero() {
		add("recorded_at < $%d", q.To)
	}
	if q.SummaryOnly {
		conditions = append(conditions, "visibility='summary'")
	}
	if !cursor.RecordedAt.IsZero() {
		args = append(args, cursor.RecordedAt, cursor.ID)
		conditions = append(conditions, fmt.Sprintf("(recorded_at,id) > ($%d,$%d)", len(args)-1, len(args)))
		args = append(args, cursor.SnapshotAt, cursor.SnapshotID)
		conditions = append(conditions, fmt.Sprintf("(recorded_at,id) <= ($%d,$%d)", len(args)-1, len(args)))
	}
	rows, err := p.pool.Query(ctx, `SELECT payload FROM audit_events WHERE `+strings.Join(conditions, " AND ")+` ORDER BY recorded_at,id`, args...)
	if err != nil {
		return audit.Page{}, err
	}
	defer rows.Close()
	events := []audit.Event{}
	for rows.Next() {
		var raw []byte
		if err = rows.Scan(&raw); err != nil {
			return audit.Page{}, err
		}
		e, decodeErr := decode[audit.Event](raw)
		if decodeErr != nil {
			return audit.Page{}, decodeErr
		}
		events = append(events, e)
	}
	if err = rows.Err(); err != nil {
		return audit.Page{}, err
	}
	page := audit.Page{}
	if len(events) > q.Limit {
		snapshot := events[len(events)-1]
		if !cursor.SnapshotAt.IsZero() {
			snapshot.RecordedAt, snapshot.ID = cursor.SnapshotAt, cursor.SnapshotID
		}
		last := events[q.Limit-1]
		page.NextCursor = audit.EncodeCursor(audit.Cursor{RecordedAt: last.RecordedAt, ID: last.ID, SnapshotAt: snapshot.RecordedAt, SnapshotID: snapshot.ID})
		events = events[:q.Limit]
	}
	page.Events = events
	return page, nil
}

func workflowIDs(refs audit.WorkflowRefs) []string {
	values := []string{refs.RecommendationID, refs.PolicyID, refs.PreflightID, refs.AuthorizationID, refs.ActionID, refs.AttemptID, refs.PluginID, refs.VerificationID, refs.RollbackID}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}
func (p *Postgres) AuditHealth(ctx context.Context) audit.Health {
	err := p.pool.Ping(ctx)
	h := audit.Health{Healthy: err == nil}
	if err != nil {
		h.PersistenceFailures = 1
		h.LastError = "audit persistence unavailable"
	}
	return h
}
func (p *Postgres) CheckAuditIntegrity(ctx context.Context) audit.IntegrityReport {
	page, err := p.QueryAuditEvents(ctx, audit.Query{Limit: 500})
	if err != nil {
		return audit.IntegrityReport{Valid: false, InvalidEvents: []string{"audit_query_failed"}}
	}
	events := page.Events
	for page.NextCursor != "" {
		page, err = p.QueryAuditEvents(ctx, audit.Query{Limit: 500, After: page.NextCursor})
		if err != nil {
			return audit.IntegrityReport{Valid: false, InvalidEvents: []string{"audit_query_failed"}}
		}
		events = append(events, page.Events...)
	}
	sort.Slice(events, func(i, j int) bool { return events[i].RecordedAt.Before(events[j].RecordedAt) })
	ids := map[string]bool{}
	r := audit.IntegrityReport{Valid: true}
	for _, e := range events {
		if ids[e.ID] {
			r.DuplicateIDs = append(r.DuplicateIDs, e.ID)
		}
		ids[e.ID] = true
		if e.Validate() != nil {
			r.InvalidEvents = append(r.InvalidEvents, e.ID)
		}
	}
	for _, e := range events {
		if e.CausationID != "" && !ids[e.CausationID] {
			r.MissingCausationLinks = append(r.MissingCausationLinks, e.ID)
		}
	}
	r.Valid = len(r.DuplicateIDs)+len(r.InvalidEvents)+len(r.MissingCausationLinks) == 0
	return r
}
func (p *Postgres) CleanupAuditEvents(ctx context.Context, before time.Time, protected map[string]bool) (int, error) {
	recommendations, err := p.ListRecommendations(ctx)
	if err != nil {
		return 0, err
	}
	actions, err := p.ListActions(ctx)
	if err != nil {
		return 0, err
	}
	jobs, err := p.ListJobs(ctx)
	if err != nil {
		return 0, err
	}
	page, err := p.QueryAuditEvents(ctx, audit.Query{Limit: 500})
	if err != nil {
		return 0, err
	}
	events := map[string]audit.Event{}
	for {
		for _, event := range page.Events {
			events[event.ID] = event
		}
		if page.NextCursor == "" {
			break
		}
		page, err = p.QueryAuditEvents(ctx, audit.Query{Limit: 500, After: page.NextCursor})
		if err != nil {
			return 0, err
		}
	}
	recommendationMap := map[int64]Recommendation{}
	for _, item := range recommendations {
		recommendationMap[item.ID] = item
	}
	actionMap := map[int64]Action{}
	for _, item := range actions {
		actionMap[item.ID] = item
	}
	jobMap := map[int64]Job{}
	for _, item := range jobs {
		jobMap[item.ID] = item
	}
	protected = mergeProtected(protected, activeAuditCorrelations(events, recommendationMap, actionMap, jobMap))
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT id,correlation_id FROM audit_events WHERE recorded_at<$1 FOR UPDATE`, before)
	if err != nil {
		return 0, err
	}
	ids := []string{}
	for rows.Next() {
		var id, correlation string
		if err = rows.Scan(&id, &correlation); err != nil {
			rows.Close()
			return 0, err
		}
		if !protected[id] && !protected[correlation] {
			ids = append(ids, id)
		}
	}
	rows.Close()
	count := 0
	for _, id := range ids {
		tag, e := tx.Exec(ctx, `DELETE FROM audit_events WHERE id=$1`, id)
		if e != nil {
			return 0, e
		}
		count += int(tag.RowsAffected())
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	return count, nil
}
