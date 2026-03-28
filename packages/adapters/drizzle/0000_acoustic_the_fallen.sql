CREATE TABLE "execution_attempts" (
	"attempt_id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"lifecycle_state_kind" text NOT NULL,
	"completed_steps_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transaction_refs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"position_id" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"event_type" text NOT NULL,
	"direction_kind" text NOT NULL,
	"occurred_at" bigint NOT NULL,
	"lifecycle_state_kind" text,
	"transaction_ref_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "breach_episodes" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"direction_kind" text NOT NULL,
	"started_at" bigint NOT NULL,
	"last_observed_at" bigint NOT NULL,
	"active_trigger_id" text
);
--> statement-breakpoint
CREATE TABLE "exit_triggers" (
	"trigger_id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"episode_id" text NOT NULL,
	"direction_kind" text NOT NULL,
	"triggered_at" bigint NOT NULL,
	"confirmation_evaluated_at" bigint NOT NULL,
	"confirmation_passed" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_previews" (
	"preview_id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"direction_kind" text NOT NULL,
	"plan_json" jsonb NOT NULL,
	"freshness_kind" text NOT NULL,
	"freshness_expires_at" bigint,
	"estimated_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "execution_previews_direction_kind_check" CHECK ("execution_previews"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach'))
);
