CREATE TABLE audit_events (
    id text PRIMARY KEY,
    idempotency_key text NOT NULL UNIQUE,
    event_type text NOT NULL,
    family text NOT NULL,
    result text NOT NULL,
    severity text NOT NULL,
    visibility text NOT NULL,
    resource_id text REFERENCES resources(id) ON DELETE RESTRICT,
    actor_id text NOT NULL,
    plugin_id text,
    workflow_ids text[] NOT NULL DEFAULT '{}',
    correlation_id text NOT NULL,
    causation_id text,
    event_time timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL,
    payload jsonb NOT NULL
);
CREATE INDEX audit_events_recorded_idx ON audit_events(recorded_at,id);
CREATE INDEX audit_events_correlation_idx ON audit_events(correlation_id,recorded_at,id);
CREATE INDEX audit_events_resource_idx ON audit_events(resource_id,recorded_at,id);
CREATE INDEX audit_events_filter_idx ON audit_events(family,result,severity,recorded_at,id);
CREATE INDEX audit_events_actor_idx ON audit_events(actor_id,recorded_at,id);
CREATE INDEX audit_events_plugin_idx ON audit_events(plugin_id,recorded_at,id);
CREATE INDEX audit_events_workflow_idx ON audit_events USING gin(workflow_ids);
