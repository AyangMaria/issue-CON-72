// Package audit defines Consize domain audit records. Audit events are durable
// domain records; they are not formatted application logs.
package audit

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

const SchemaVersion = 1
const DefaultMaxDetailsBytes = 32 << 10

type Family string

const (
	FamilyResource       Family = "resource"
	FamilyDiscovery      Family = "discovery"
	FamilyPlugin         Family = "plugin"
	FamilyEvidence       Family = "evidence"
	FamilyRecommendation Family = "recommendation"
	FamilyPolicy         Family = "policy"
	FamilyPreflight      Family = "preflight"
	FamilyAuthorization  Family = "authorization"
	FamilyAction         Family = "action"
	FamilyWorker         Family = "worker"
	FamilyVerification   Family = "verification"
	FamilyRollback       Family = "rollback"
	FamilyConfiguration  Family = "configuration"
	FamilyMigration      Family = "migration"
	FamilySecurity       Family = "security"
)

type Kind string

const (
	KindCommand        Kind = "command"
	KindDecision       Kind = "decision"
	KindProviderEffect Kind = "provider_effect"
	KindObservation    Kind = "observation"
	KindOutcome        Kind = "outcome"
)

type Result string

const (
	ResultRequested    Result = "requested"
	ResultAllowed      Result = "allowed"
	ResultDenied       Result = "denied"
	ResultSucceeded    Result = "succeeded"
	ResultFailed       Result = "failed"
	ResultPending      Result = "pending"
	ResultInconclusive Result = "inconclusive"
)

type Severity string

const (
	SeverityInfo     Severity = "info"
	SeverityWarning  Severity = "warning"
	SeverityError    Severity = "error"
	SeverityCritical Severity = "critical"
)

type Visibility string

const (
	VisibilitySummary Visibility = "summary"
	VisibilityDetail  Visibility = "detail"
)

type Actor struct {
	Type    string `json:"type"`
	ID      string `json:"id"`
	Display string `json:"display,omitempty"`
}
type ResourceRef struct {
	ID       string `json:"id"`
	Type     string `json:"type,omitempty"`
	Provider string `json:"provider,omitempty"`
}
type WorkflowRefs struct {
	RecommendationID string `json:"recommendation_id,omitempty"`
	PolicyID         string `json:"policy_id,omitempty"`
	PreflightID      string `json:"preflight_id,omitempty"`
	AuthorizationID  string `json:"authorization_id,omitempty"`
	ActionID         string `json:"action_id,omitempty"`
	AttemptID        string `json:"attempt_id,omitempty"`
	PluginID         string `json:"plugin_id,omitempty"`
	VerificationID   string `json:"verification_id,omitempty"`
	RollbackID       string `json:"rollback_id,omitempty"`
}
type Redaction struct {
	Applied       bool     `json:"applied"`
	Fields        []string `json:"fields,omitempty"`
	Truncated     bool     `json:"truncated,omitempty"`
	OriginalBytes int      `json:"original_bytes,omitempty"`
}
type Event struct {
	ID             string         `json:"id"`
	IdempotencyKey string         `json:"idempotency_key"`
	Type           string         `json:"type"`
	Family         Family         `json:"family"`
	Kind           Kind           `json:"kind"`
	SchemaVersion  int            `json:"schema_version"`
	Timestamp      time.Time      `json:"timestamp"`
	RecordedAt     time.Time      `json:"recorded_at"`
	Actor          Actor          `json:"actor"`
	Source         string         `json:"source"`
	Resource       *ResourceRef   `json:"resource,omitempty"`
	OrganizationID string         `json:"organization_id,omitempty"`
	CorrelationID  string         `json:"correlation_id"`
	CausationID    string         `json:"causation_id,omitempty"`
	Workflow       WorkflowRefs   `json:"workflow,omitempty"`
	Result         Result         `json:"result"`
	Severity       Severity       `json:"severity"`
	Visibility     Visibility     `json:"visibility"`
	ReasonCode     string         `json:"reason_code"`
	Summary        string         `json:"summary"`
	Details        map[string]any `json:"details,omitempty"`
	Redaction      Redaction      `json:"redaction"`
}
type Input struct {
	ID, IdempotencyKey, Type                   string
	Family                                     Family
	Kind                                       Kind
	Timestamp                                  time.Time
	Actor                                      Actor
	Source                                     string
	Resource                                   *ResourceRef
	OrganizationID, CorrelationID, CausationID string
	Workflow                                   WorkflowRefs
	Result                                     Result
	Severity                                   Severity
	Visibility                                 Visibility
	ReasonCode, Summary                        string
	Details                                    map[string]any
}
type Cursor struct {
	RecordedAt time.Time `json:"recorded_at"`
	ID         string    `json:"id"`
	SnapshotAt time.Time `json:"snapshot_at"`
	SnapshotID string    `json:"snapshot_id"`
}
type Query struct {
	ResourceID, WorkflowID, CorrelationID, Family, Result, Severity, ActorID, PluginID string
	From, To                                                                           time.Time
	Limit                                                                              int
	After                                                                              string
	SummaryOnly                                                                        bool
}

func (q Query) Validate() error {
	if q.Family != "" && !validFamily(Family(q.Family)) {
		return fmt.Errorf("unknown audit family %q", q.Family)
	}
	if q.Result != "" && !validResult(Result(q.Result)) {
		return fmt.Errorf("unknown audit result %q", q.Result)
	}
	if q.Severity != "" && !validSeverity(Severity(q.Severity)) {
		return fmt.Errorf("unknown audit severity %q", q.Severity)
	}
	if !q.From.IsZero() && !q.To.IsZero() && !q.From.Before(q.To) {
		return errors.New("audit from must be before to")
	}
	if q.Limit < 0 || q.Limit > 500 {
		return errors.New("audit limit must be between 1 and 500")
	}
	_, err := DecodeCursor(q.After)
	return err
}

type Page struct {
	Events     []Event `json:"events"`
	NextCursor string  `json:"next_cursor,omitempty"`
}
type Health struct {
	Healthy             bool       `json:"healthy"`
	Backlog             int        `json:"backlog"`
	PersistenceFailures uint64     `json:"persistence_failures"`
	OldestPending       *time.Time `json:"oldest_pending_event,omitempty"`
	LastError           string     `json:"last_error,omitempty"`
}
type IntegrityReport struct {
	Valid                 bool     `json:"valid"`
	DuplicateIDs          []string `json:"duplicate_ids,omitempty"`
	InvalidEvents         []string `json:"invalid_events,omitempty"`
	MissingCausationLinks []string `json:"missing_causation_links,omitempty"`
	OrphanedReferences    []string `json:"orphaned_references,omitempty"`
}
type Store interface {
	AppendAuditEvent(context.Context, Event) (Event, error)
	QueryAuditEvents(context.Context, Query) (Page, error)
	AuditHealth(context.Context) Health
	CheckAuditIntegrity(context.Context) IntegrityReport
	CleanupAuditEvents(context.Context, time.Time, map[string]bool) (int, error)
}

type Writer struct {
	store           Store
	now             func() time.Time
	maxDetailsBytes int
}

type correlationContextKey struct{}

func WithCorrelation(ctx context.Context, correlationID string) context.Context {
	if strings.TrimSpace(correlationID) == "" {
		return ctx
	}
	return context.WithValue(ctx, correlationContextKey{}, correlationID)
}

func CorrelationFromContext(ctx context.Context) string {
	value, _ := ctx.Value(correlationContextKey{}).(string)
	return value
}

func NewWriter(s Store) *Writer {
	return &Writer{store: s, now: time.Now, maxDetailsBytes: DefaultMaxDetailsBytes}
}
func (w *Writer) Append(ctx context.Context, in Input) (Event, error) {
	if w == nil || w.store == nil {
		return Event{}, errors.New("audit store is required")
	}
	e := Event{ID: in.ID, IdempotencyKey: in.IdempotencyKey, Type: in.Type, Family: in.Family, Kind: in.Kind, SchemaVersion: SchemaVersion, Timestamp: in.Timestamp.UTC(), RecordedAt: w.now().UTC(), Actor: in.Actor, Source: in.Source, Resource: in.Resource, OrganizationID: in.OrganizationID, CorrelationID: in.CorrelationID, CausationID: in.CausationID, Workflow: in.Workflow, Result: in.Result, Severity: in.Severity, Visibility: in.Visibility, ReasonCode: in.ReasonCode, Summary: in.Summary}
	if display, changed := sanitizeValue(e.Actor.Display); changed {
		e.Actor.Display = display.(string)
	}
	if e.ID == "" {
		e.ID = uuid.NewString()
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = e.RecordedAt
	}
	if e.IdempotencyKey == "" {
		e.IdempotencyKey = e.ID
	}
	if e.Severity == "" {
		e.Severity = SeverityInfo
	}
	if e.Visibility == "" {
		e.Visibility = VisibilityDetail
	}
	var err error
	e.Details, e.Redaction, err = SanitizeDetails(in.Details, w.maxDetailsBytes)
	if err != nil {
		return Event{}, err
	}
	if err = e.Validate(); err != nil {
		return Event{}, err
	}
	return w.store.AppendAuditEvent(ctx, e)
}

var eventType = regexp.MustCompile(`^[a-z][a-z0-9_.-]{2,127}$`)

func (e Event) Validate() error {
	if e.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported audit schema version %d", e.SchemaVersion)
	}
	if e.ID == "" || e.IdempotencyKey == "" || !eventType.MatchString(e.Type) || !validFamily(e.Family) || !validKind(e.Kind) {
		return errors.New("invalid audit identity or taxonomy")
	}
	if e.Timestamp.IsZero() || e.RecordedAt.IsZero() || e.Actor.Type == "" || e.Actor.ID == "" || e.Source == "" || e.CorrelationID == "" || e.Result == "" || e.Severity == "" || e.Visibility == "" || e.ReasonCode == "" || strings.TrimSpace(e.Summary) == "" {
		return errors.New("audit event is missing required context")
	}
	if !validResult(e.Result) || !validSeverity(e.Severity) || !validVisibility(e.Visibility) {
		return errors.New("invalid audit result, severity, or visibility")
	}
	if e.Resource != nil && strings.TrimSpace(e.Resource.ID) == "" {
		return errors.New("audit resource reference requires an id")
	}
	if len(e.Summary) > 512 {
		return errors.New("audit summary exceeds 512 bytes")
	}
	return nil
}

func validResult(v Result) bool {
	return v == ResultRequested || v == ResultAllowed || v == ResultDenied || v == ResultSucceeded || v == ResultFailed || v == ResultPending || v == ResultInconclusive
}

func validSeverity(v Severity) bool {
	return v == SeverityInfo || v == SeverityWarning || v == SeverityError || v == SeverityCritical
}

func validVisibility(v Visibility) bool {
	return v == VisibilitySummary || v == VisibilityDetail
}
func validFamily(v Family) bool {
	for _, x := range []Family{FamilyResource, FamilyDiscovery, FamilyPlugin, FamilyEvidence, FamilyRecommendation, FamilyPolicy, FamilyPreflight, FamilyAuthorization, FamilyAction, FamilyWorker, FamilyVerification, FamilyRollback, FamilyConfiguration, FamilyMigration, FamilySecurity} {
		if v == x {
			return true
		}
	}
	return false
}
func validKind(v Kind) bool {
	return v == KindCommand || v == KindDecision || v == KindProviderEffect || v == KindObservation || v == KindOutcome
}

var allowed = map[string]bool{"operation": true, "status": true, "previous_status": true, "mode": true, "target": true, "reason": true, "error_code": true, "error_message": true, "duration_ms": true, "attempt": true, "count": true, "version": true, "checksum": true, "digest": true, "provider_request_id": true, "changed_fields": true, "threshold": true, "observed": true, "unit": true, "window": true, "policy_rule": true, "decision": true, "permissions": true, "labels": true, "annotations": true, "url": true, "http_status": true}
var sensitiveKey = regexp.MustCompile(`(?i)(secret|password|passwd|token|authorization|cookie|credential|private.?key|kubeconfig|certificate|client.?key|api.?key)`)
var tokenLike = regexp.MustCompile(`(?i)(bearer\s+[a-z0-9._~+/-]+=*|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16})`)

func SanitizeDetails(details map[string]any, max int) (map[string]any, Redaction, error) {
	if max <= 0 {
		max = DefaultMaxDetailsBytes
	}
	out := map[string]any{}
	meta := Redaction{}
	for key, value := range details {
		if !allowed[key] {
			return nil, meta, fmt.Errorf("audit detail field %q is not allowlisted", key)
		}
		if sensitiveKey.MatchString(key) {
			out[key] = "[REDACTED]"
			meta.Applied = true
			meta.Fields = append(meta.Fields, key)
			continue
		}
		normalized, err := normalizeValue(value)
		if err != nil {
			return nil, meta, fmt.Errorf("encode audit detail %q: %w", key, err)
		}
		sanitized, changed := sanitizeValue(normalized)
		if key == "url" {
			sanitized, changed = sanitizeURL(normalized)
		}
		out[key] = sanitized
		if changed {
			meta.Applied = true
			meta.Fields = append(meta.Fields, key)
		}
	}
	sort.Strings(meta.Fields)
	raw, err := json.Marshal(out)
	if err != nil {
		return nil, meta, err
	}
	meta.OriginalBytes = len(raw)
	if len(raw) > max {
		meta.Truncated = true
		return map[string]any{"error_code": "details_truncated", "count": len(details)}, meta, nil
	}
	return out, meta, nil
}

func normalizeValue(value any) (any, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var normalized any
	if err := json.Unmarshal(raw, &normalized); err != nil {
		return nil, err
	}
	return normalized, nil
}

func sanitizeURL(value any) (any, bool) {
	raw, ok := value.(string)
	if !ok {
		return sanitizeValue(value)
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return "[REDACTED]", true
	}
	changed := parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != ""
	parsed.User, parsed.RawQuery, parsed.Fragment = nil, "", ""
	clean := parsed.String()
	if tokenLike.MatchString(clean) {
		return "[REDACTED]", true
	}
	return clean, changed
}
func sanitizeValue(v any) (any, bool) {
	switch x := v.(type) {
	case string:
		if tokenLike.MatchString(x) {
			return "[REDACTED]", true
		}
		if len(x) > 4096 {
			return x[:4096], true
		}
		return x, false
	case map[string]any:
		o := map[string]any{}
		changed := false
		for k, v := range x {
			if sensitiveKey.MatchString(k) {
				o[k] = "[REDACTED]"
				changed = true
			} else {
				var c bool
				o[k], c = sanitizeValue(v)
				changed = changed || c
			}
		}
		return o, changed
	case []any:
		o := make([]any, len(x))
		changed := false
		for i, v := range x {
			var c bool
			o[i], c = sanitizeValue(v)
			changed = changed || c
		}
		return o, changed
	default:
		return v, false
	}
}
func EncodeCursor(c Cursor) string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}
func DecodeCursor(raw string) (Cursor, error) {
	if raw == "" {
		return Cursor{}, nil
	}
	b, e := base64.RawURLEncoding.DecodeString(raw)
	if e != nil {
		return Cursor{}, errors.New("invalid audit cursor")
	}
	var c Cursor
	if json.Unmarshal(b, &c) != nil || c.RecordedAt.IsZero() || c.ID == "" || c.SnapshotAt.IsZero() || c.SnapshotID == "" {
		return Cursor{}, errors.New("invalid audit cursor")
	}
	return c, nil
}
func ExportJSONL(w io.Writer, events []Event) error {
	enc := json.NewEncoder(w)
	for _, e := range events {
		if err := enc.Encode(e); err != nil {
			return err
		}
	}
	return nil
}
func SameLogicalEvent(a, b Event) bool {
	aa := a
	bb := b
	aa.ID = ""
	bb.ID = ""
	aa.RecordedAt = time.Time{}
	bb.RecordedAt = time.Time{}
	aa.Timestamp = time.Time{}
	bb.Timestamp = time.Time{}
	x, _ := json.Marshal(aa)
	y, _ := json.Marshal(bb)
	return sha256.Sum256(x) == sha256.Sum256(y)
}

type Sink interface{ Write(string, any) error }
type NoopSink struct{}

func (NoopSink) Write(string, any) error { return nil }
