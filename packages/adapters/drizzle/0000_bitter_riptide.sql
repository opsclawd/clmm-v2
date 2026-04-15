CREATE TABLE "breach_episodes" (
	"episode_id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"direction_kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"consecutive_count" integer DEFAULT 1 NOT NULL,
	"started_at" bigint NOT NULL,
	"last_observed_at" bigint NOT NULL,
	"trigger_id" text,
	"closed_at" bigint,
	"close_reason" text,
	CONSTRAINT "breach_episodes_direction_kind_check" CHECK ("breach_episodes"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach')),
	CONSTRAINT "breach_episodes_status_check" CHECK ("breach_episodes"."status" in ('open', 'closed')),
	CONSTRAINT "breach_episodes_consecutive_count_min_check" CHECK ("breach_episodes"."consecutive_count" >= 1),
	CONSTRAINT "breach_episodes_close_reason_check" CHECK ("breach_episodes"."close_reason" is null or "breach_episodes"."close_reason" in ('position-recovered', 'direction-reversed')),
	CONSTRAINT "breach_episodes_closed_fields_consistency_check" CHECK ((
      ("breach_episodes"."status" = 'open' and "breach_episodes"."closed_at" is null and "breach_episodes"."close_reason" is null)
      or
      ("breach_episodes"."status" = 'closed' and "breach_episodes"."closed_at" is not null and "breach_episodes"."close_reason" is not null)
    ))
);
--> statement-breakpoint
CREATE TABLE "exit_triggers" (
	"trigger_id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"episode_id" text NOT NULL,
	"direction_kind" text NOT NULL,
	"triggered_at" bigint NOT NULL,
	"confirmation_evaluated_at" bigint NOT NULL,
	"confirmation_passed" boolean DEFAULT true NOT NULL,
	CONSTRAINT "exit_triggers_episode_id_unique" UNIQUE("episode_id"),
	CONSTRAINT "exit_triggers_direction_kind_check" CHECK ("exit_triggers"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach'))
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
--> statement-breakpoint
CREATE TABLE "execution_attempts" (
	"attempt_id" text PRIMARY KEY NOT NULL,
	"preview_id" text,
	"episode_id" text,
	"position_id" text NOT NULL,
	"direction_kind" text NOT NULL,
	"lifecycle_state_kind" text NOT NULL,
	"completed_steps_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transaction_refs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "execution_attempts_direction_kind_check" CHECK ("execution_attempts"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach'))
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
CREATE TABLE "prepared_payloads" (
	"payload_id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"unsigned_payload" "bytea" NOT NULL,
	"payload_version" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "prepared_payloads_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
CREATE TABLE "history_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"event_type" text NOT NULL,
	"direction_kind" text NOT NULL,
	"occurred_at" bigint NOT NULL,
	"lifecycle_state_kind" text,
	"transaction_ref_json" jsonb,
	CONSTRAINT "history_events_direction_kind_check" CHECK ("history_events"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach'))
);
--> statement-breakpoint
CREATE TABLE "monitored_wallets" (
	"wallet_id" text PRIMARY KEY NOT NULL,
	"enrolled_at" bigint NOT NULL,
	"last_scanned_at" bigint,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_dedup" (
	"trigger_id" text PRIMARY KEY NOT NULL,
	"dispatched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_position_ownership" (
	"wallet_id" text NOT NULL,
	"position_id" text NOT NULL,
	"first_seen_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	CONSTRAINT "wallet_position_ownership_wallet_position_unique" UNIQUE("wallet_id","position_id")
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"trigger_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"position_id" text NOT NULL,
	"direction_kind" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"created_at" bigint NOT NULL,
	"attempted_at" bigint,
	"delivered_at" bigint,
	"failure_reason" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "breach_episodes_one_open_episode_per_position_idx" ON "breach_episodes" USING btree ("position_id") WHERE "breach_episodes"."status" = 'open';--> statement-breakpoint
CREATE INDEX "notification_events_trigger_id_idx" ON "notification_events" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "notification_events_status_idx" ON "notification_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_events_created_at_idx" ON "notification_events" USING btree ("created_at");