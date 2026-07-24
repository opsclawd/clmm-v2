CREATE TABLE "position_plans" (
	"plan_id" text PRIMARY KEY NOT NULL,
	"canonical_hash" text NOT NULL,
	"position_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"requested_at" bigint NOT NULL,
	"responded_at" bigint,
	"as_of_at" bigint,
	"expires_at" bigint,
	"action_kind" text NOT NULL,
	"action_reasons" jsonb NOT NULL DEFAULT '[]',
	"snapshot_fingerprint" text,
	"lifecycle_kind" text NOT NULL,
	"decision_kind" text,
	"attempt_id" text,
	"canonical_result_json" jsonb,
	"result_idempotency_key" text,
	"delivery_attempts" bigint NOT NULL DEFAULT 0,
	"next_attempt_at" bigint,
	"last_error_class" text,
	"delivered_at" bigint,
	CONSTRAINT "position_plans_action_kind_check" CHECK ("action_kind" IN ('HOLD', 'STAND_DOWN', 'REQUEST_EXIT_CLMM')),
	CONSTRAINT "position_plans_lifecycle_kind_check" CHECK ("lifecycle_kind" IN ('requested', 'advisory-ready', 'exit-previewed', 'awaiting-signature', 'submitted', 'result-pending', 'reported', 'report-failed', 'conflict', 'superseded')),
	CONSTRAINT "position_plans_decision_kind_check" CHECK ("decision_kind" IS NULL OR "decision_kind" IN ('acknowledged', 'stand-down', 'expired', 'position-changed', 'rejected', 'executed', 'failed')),
	CONSTRAINT "position_plans_delivery_attempts_min_check" CHECK ("delivery_attempts" >= 0)
);

CREATE UNIQUE INDEX "position_plans_replay_identity_idx" ON "position_plans" ("plan_id", "canonical_hash");
CREATE INDEX "position_plans_position_id_idx" ON "position_plans" ("position_id");
CREATE INDEX "position_plans_delivery_due_idx" ON "position_plans" ("next_attempt_at");

CREATE TABLE "plan_result_outbox" (
	"result_id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"canonical_result_json" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt_count" bigint NOT NULL DEFAULT 0,
	"next_attempt_at" bigint NOT NULL,
	"last_error_class" text,
	"delivered_at" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "plan_result_outbox_attempt_count_min_check" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "plan_result_outbox_idempotency_key_idx" ON "plan_result_outbox" ("idempotency_key");
CREATE INDEX "plan_result_outbox_due_idx" ON "plan_result_outbox" ("next_attempt_at") WHERE "delivered_at" IS NULL;