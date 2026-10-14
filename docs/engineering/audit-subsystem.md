# Provider-neutral audit subsystem

Consize audit events are durable domain records. They explain what a person or component requested, what Consize decided, what an external provider changed, what Consize observed afterward, and how the workflow ended. They are not formatted application logs and must not contain arbitrary provider responses.

## Guarantees

- One versioned event contract covers every provider and workflow.
- Events are append-only through normal application interfaces. There is no update method.
- `idempotency_key` makes retries and duplicate delivery return the original logical event.
- `timestamp` preserves when the event happened; `recorded_at` records when storage accepted it.
- Reads are ordered by `(recorded_at, id)`. Cursors include a high-water mark, so later writes do not change an in-progress pagination snapshot.
- Required writes fail closed. A consequential API path does not return success after its required audit write fails.
- The durable JSON state backup includes audit events. PostgreSQL backup and restore must include `audit_events` and the migration ledger.

Append-only application behavior is **not cryptographic immutability**. A host or database administrator can alter storage. Signed transparency logs and legal holds are outside the OSS scope.

## Event contract

Every event contains:

| Field | Meaning |
| --- | --- |
| `id` | Globally unique event identifier. |
| `idempotency_key` | Stable producer key for one logical event. |
| `type` | Specific lower-case event name, such as `policy.evaluated`. |
| `family` | Stable workflow area used for filtering. |
| `kind` | `command`, `decision`, `provider_effect`, `observation`, or `outcome`. |
| `schema_version` | Event contract version. Unknown versions fail validation. |
| `timestamp` | Original event time supplied by the producer. |
| `recorded_at` | Persistence time assigned by the audit writer. |
| `actor` | Actor type, stable ID, and optional display value. Never place credentials here. |
| `source` | Component that emitted the event. |
| `resource` | Exact Consize resource ID and optional type/provider. |
| `organization_id` | Reserved single-organization assumption for OSS; not a tenant boundary. |
| `correlation_id` | Stable ID shared by the complete workflow. API requests use `X-Request-ID`. |
| `causation_id` | ID of the event that directly caused this event. |
| `workflow` | Exact recommendation, policy, preflight, authorization, action, attempt, plugin, verification, and rollback IDs. |
| `result` | `requested`, `allowed`, `denied`, `succeeded`, `failed`, `pending`, or `inconclusive`. |
| `severity` | `info`, `warning`, `error`, or `critical`. |
| `visibility` | `summary` for primary activity or `detail` for the complete history. |
| `reason_code` | Stable machine-readable reason. |
| `summary` | Bounded human-readable explanation, never the sole source of identity. |
| `details` | Bounded, allowlisted structured fields. |
| `redaction` | Whether values were redacted or truncated, affected fields, and original encoded size. |

## Event catalog

Families are `resource`, `discovery`, `plugin`, `evidence`, `recommendation`, `policy`, `preflight`, `authorization`, `action`, `worker`, `verification`, `rollback`, `configuration`, `migration`, and `security`.

Use these naming patterns consistently:

| Workflow | Detailed events | Summary event |
| --- | --- | --- |
| Discovery | `discovery.requested`, `resource.observed`, `resource.reconciled` | `discovery.completed` or `discovery.failed` |
| Plugin | `plugin.install_requested`, `plugin.permissions_evaluated`, `plugin.health_observed` | `plugin.installed`, `plugin.revoked`, or `plugin.failed` |
| Evidence | `evidence.collection_requested`, `evidence.received`, `evidence.rejected` | `evidence.ready` or `evidence.failed` |
| Recommendation | `recommendation.requested`, `recommendation.generated`, `recommendation.superseded` | `recommendation.ready`, `recommendation.expired`, or `recommendation.failed` |
| Policy and authorization | `policy.evaluated`, `preflight.completed`, `authorization.requested` | `authorization.allowed` or `authorization.denied` |
| Action and worker | `action.requested`, `action.planned`, `worker.claimed`, `provider.change_requested`, `provider.change_observed` | `action.succeeded`, `action.failed`, or `action.manual_intervention` |
| Verification and rollback | `verification.started`, `verification.observed`, `rollback.requested`, `provider.rollback_observed` | `verification.passed`, `verification.failed`, `rollback.succeeded`, or `rollback.failed` |
| Configuration and security | `configuration.changed`, `migration.applied`, `security.control_evaluated` | The same event may be summary-visible when operator action is required. |

Requested, planned, retry, poll, and raw observation events normally use `visibility=detail`. Decisions, provider effects that changed state, terminal outcomes, denials, failures, and manual intervention normally use `visibility=summary`.

## Producer integration

All producers use `audit.Writer.Append`; plugins do not write directly to storage.

1. Choose a stable idempotency key before the first attempt. Include the workflow ID, operation, and logical stage, not a random retry number.
2. Reuse the API request correlation ID through jobs, plugin calls, retries, verification, and rollback.
3. Set `causation_id` to the immediate predecessor event, not merely the workflow root.
4. Populate exact workflow references. Do not parse identifiers from `summary` or `details`.
5. Supply the original event timestamp when receiving an asynchronous provider result.
6. Use a stable reason code and a short summary that is useful without exposing sensitive values.
7. Pass only allowlisted details. A rejected detail field is a producer defect, not permission to store a provider payload.
8. Treat an append error for a required event as an operation failure. Do not log and continue.

For a transaction that changes durable Consize state, write the state and required event in the same database transaction. When a provider effect or another process boundary prevents one transaction, first persist the command/outbox record and its audit event, then let the worker deliver it idempotently. A provider call must never be the only record that an operation was attempted.

## Correlation model

A complete chain can look like this:

```text
recommendation.ready
  -> policy.evaluated
  -> preflight.completed
  -> authorization.allowed
  -> action.requested
  -> worker.claimed
  -> provider.change_requested
  -> provider.change_observed
  -> verification.started
  -> verification.passed
```

Every event shares one correlation ID. Each arrow is represented by `causation_id`. Workflow references let operators query one recommendation, action, attempt, plugin, verification, or rollback without relying on text.

## Redaction and payload limits

Top-level detail fields are allowlisted in `internal/audit`. Unknown fields fail before persistence. Secret-like keys and token-like values are replaced with `[REDACTED]`, including nested maps and arrays. This covers passwords, API tokens, authorization and cookie values, private keys, kubeconfig, credentials, certificates, and common cloud access keys.

Labels, annotations, URLs, error messages, and actor display values are untrusted input. Producers should minimize them. The writer scans values, limits individual strings, caps encoded details at 32 KiB, and replaces oversized details with truncation metadata. Never pass raw HTTP headers, environment variables, provider responses, Kubernetes secrets, or plugin-specific opaque payloads.

Redaction reduces accidental exposure; it does not prove that arbitrary prose contains no secret. Review new producers and their fixtures for data minimization.

## Query and export

`GET /api/audit` supports `resource_id`, `workflow_id`, `correlation_id`, `family`, `result`, `severity`, `actor_id`, `plugin_id`, `from`, `to`, `view`, `limit`, and `cursor`. Times are RFC3339; `from` is inclusive and `to` is exclusive. `view=summary` excludes detailed events.

`GET /api/audit/export` accepts the same filters and returns `application/x-ndjson`. Each line is one complete `AuditEvent`. Output uses the stable recorded-time/event-ID order and one pagination snapshot.

`GET /api/audit/health` exposes persistence health, backlog, persistence failures, oldest pending time, and a redacted error. `GET /api/audit/integrity` checks schema validity, duplicate IDs, missing causation links, and orphaned resource references.

## Retention and cleanup

Retention is an explicit operator action, not an automatic startup side effect. Select a cutoff according to the deployment's incident, release, and compliance needs. Before deletion, export and back up the same snapshot.

```bash
consize storage audit-cleanup \
  -state ./consize-state.json \
  -before 2026-07-01T00:00:00Z \
  -confirm "DELETE EXPIRED AUDIT EVENTS"
```

Use `-database-url` instead of `-state` for PostgreSQL. The cutoff must be in the past. The command reports the number removed and never accepts a relative or implicit date.

Cleanup must preserve:

- correlations referenced by non-terminal recommendations, actions, or jobs;
- IDs or correlations explicitly protected for release diagnostics or incidents;
- records newer than the cutoff.

Renewing retention requires a new operator decision. Cleanup is transactional: a persistence failure restores the in-memory set or rolls back the PostgreSQL transaction. Enterprise legal holds and tenant-specific retention are outside OSS scope.

## Backup and restore

For local durable storage, use the existing `storage backup` and `storage restore` commands. The state file and checksum include audit events. After restore, run storage diagnostics and `/api/audit/integrity` before enabling writes.

For PostgreSQL, use a consistent `pg_dump`/`pg_restore` procedure that includes `audit_events`, resources, recommendations, actions, jobs, and `schema_migrations`. Restore into an isolated database, run migrations, compare counts, run integrity checks, and only then switch traffic.

## Compatibility and limitations

Schema changes require a new event schema version, a deterministic durable-state migration, a PostgreSQL migration, compatibility tests, and regenerated OpenAPI declarations. Historical events are preserved rather than rewritten.

The current OSS writer persists directly to the authoritative audit store and reports no publication backlog because SIEM/export delivery is not implemented. A future cross-process exporter must use a durable outbox and expose retries, oldest pending event, and dead-letter state; it must not reinterpret successful storage as successful external delivery.
