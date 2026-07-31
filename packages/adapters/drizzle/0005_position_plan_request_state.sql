CREATE TABLE "position_plan_request_state" (
	"position_id" text PRIMARY KEY NOT NULL,
	"lease_token" text,
	"lease_until" bigint,
	"last_attempt_at" bigint,
	"last_range_state" text,
	"last_breach_qualified_at" bigint,
	"last_closed_candle_at" bigint,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "position_plan_request_state_last_range_state_check" CHECK ("position_plan_request_state"."last_range_state" is null or "position_plan_request_state"."last_range_state" in ('in-range', 'below-range', 'above-range')),
	CONSTRAINT "position_plan_request_state_lease_until_check" CHECK ("position_plan_request_state"."lease_until" is null or "position_plan_request_state"."lease_until" >= 0),
	CONSTRAINT "position_plan_request_state_last_attempt_at_check" CHECK ("position_plan_request_state"."last_attempt_at" is null or "position_plan_request_state"."last_attempt_at" >= 0),
	CONSTRAINT "position_plan_request_state_last_breach_qualified_at_check" CHECK ("position_plan_request_state"."last_breach_qualified_at" is null or "position_plan_request_state"."last_breach_qualified_at" >= 0),
	CONSTRAINT "position_plan_request_state_last_closed_candle_at_check" CHECK ("position_plan_request_state"."last_closed_candle_at" is null or "position_plan_request_state"."last_closed_candle_at" >= 0),
	CONSTRAINT "position_plan_request_state_updated_at_check" CHECK ("position_plan_request_state"."updated_at" >= 0)
);
--> statement-breakpoint
CREATE INDEX "position_plan_request_state_lease_until_idx" ON "position_plan_request_state" USING btree ("lease_until");
