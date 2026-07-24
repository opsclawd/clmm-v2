ALTER TABLE "execution_previews" DROP CONSTRAINT "execution_previews_direction_kind_check";--> statement-breakpoint
ALTER TABLE "execution_attempts" DROP CONSTRAINT "execution_attempts_direction_kind_check";--> statement-breakpoint
ALTER TABLE "history_events" DROP CONSTRAINT "history_events_direction_kind_check";--> statement-breakpoint
ALTER TABLE "execution_previews" ALTER COLUMN "direction_kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_attempts" ALTER COLUMN "direction_kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "history_events" ALTER COLUMN "direction_kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_previews" ADD COLUMN "origin_kind" text DEFAULT 'qualified-breach' NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_previews" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "execution_previews" ADD COLUMN "canonical_hash" text;--> statement-breakpoint
ALTER TABLE "execution_previews" ADD COLUMN "canonical_exit_intent" text;--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD COLUMN "origin_kind" text DEFAULT 'qualified-breach' NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD COLUMN "canonical_hash" text;--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD COLUMN "canonical_exit_intent" text;--> statement-breakpoint
ALTER TABLE "history_events" ADD COLUMN "origin_kind" text DEFAULT 'qualified-breach' NOT NULL;--> statement-breakpoint
ALTER TABLE "history_events" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "history_events" ADD COLUMN "canonical_hash" text;--> statement-breakpoint
ALTER TABLE "history_events" ADD COLUMN "canonical_exit_intent" text;--> statement-breakpoint
ALTER TABLE "position_plans" ADD COLUMN "execution_origin_json" jsonb;--> statement-breakpoint
ALTER TABLE "position_plans" ADD COLUMN "lifecycle_state_json" jsonb;--> statement-breakpoint
ALTER TABLE "execution_previews" ADD CONSTRAINT "execution_previews_origin_kind_check" CHECK ("execution_previews"."origin_kind" in ('qualified-breach', 'regime-plan'));--> statement-breakpoint
ALTER TABLE "execution_previews" ADD CONSTRAINT "execution_previews_direction_kind_check" CHECK (("execution_previews"."origin_kind" = 'qualified-breach' and "execution_previews"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach')) or ("execution_previews"."origin_kind" = 'regime-plan' and "execution_previews"."direction_kind" is null));--> statement-breakpoint
ALTER TABLE "execution_previews" ADD CONSTRAINT "execution_previews_regime_fields_check" CHECK (("execution_previews"."origin_kind" = 'regime-plan' and "execution_previews"."plan_id" is not null and "execution_previews"."canonical_hash" is not null and "execution_previews"."canonical_exit_intent" is not null) or ("execution_previews"."origin_kind" = 'qualified-breach' and "execution_previews"."plan_id" is null and "execution_previews"."canonical_hash" is null and "execution_previews"."canonical_exit_intent" is null));--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_origin_kind_check" CHECK ("execution_attempts"."origin_kind" in ('qualified-breach', 'regime-plan'));--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_direction_kind_check" CHECK (("execution_attempts"."origin_kind" = 'qualified-breach' and "execution_attempts"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach')) or ("execution_attempts"."origin_kind" = 'regime-plan' and "execution_attempts"."direction_kind" is null));--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_regime_fields_check" CHECK (("execution_attempts"."origin_kind" = 'regime-plan' and "execution_attempts"."plan_id" is not null and "execution_attempts"."canonical_hash" is not null and "execution_attempts"."canonical_exit_intent" is not null) or ("execution_attempts"."origin_kind" = 'qualified-breach' and "execution_attempts"."plan_id" is null and "execution_attempts"."canonical_hash" is null and "execution_attempts"."canonical_exit_intent" is null));--> statement-breakpoint
ALTER TABLE "history_events" ADD CONSTRAINT "history_events_origin_kind_check" CHECK ("history_events"."origin_kind" in ('qualified-breach', 'regime-plan'));--> statement-breakpoint
ALTER TABLE "history_events" ADD CONSTRAINT "history_events_direction_kind_check" CHECK (("history_events"."origin_kind" = 'qualified-breach' and "history_events"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach')) or ("history_events"."origin_kind" = 'regime-plan' and "history_events"."direction_kind" is null));--> statement-breakpoint
ALTER TABLE "history_events" ADD CONSTRAINT "history_events_regime_fields_check" CHECK (("history_events"."origin_kind" = 'regime-plan' and "history_events"."plan_id" is not null and "history_events"."canonical_hash" is not null and "history_events"."canonical_exit_intent" is not null) or ("history_events"."origin_kind" = 'qualified-breach' and "history_events"."plan_id" is null and "history_events"."canonical_hash" is null and "history_events"."canonical_exit_intent" is null));--> statement-breakpoint
ALTER TABLE "position_plans" ADD CONSTRAINT "position_plans_delivery_consistency" CHECK ("position_plans"."lifecycle_kind" != 'reported' OR "position_plans"."delivered_at" IS NOT NULL);
