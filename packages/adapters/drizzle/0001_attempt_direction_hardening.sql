ALTER TABLE "execution_attempts" ADD COLUMN "direction_kind" text;
--> statement-breakpoint
UPDATE "execution_attempts" AS ea
SET "direction_kind" = history_match."direction_kind"
FROM LATERAL (
	SELECT he."direction_kind"
	FROM "history_events" AS he
	WHERE he."position_id" = ea."position_id"
	  AND he."occurred_at" <= ea."updated_at"
	ORDER BY he."occurred_at" DESC
	LIMIT 1
) AS history_match
WHERE ea."direction_kind" IS NULL;
--> statement-breakpoint
UPDATE "execution_attempts" AS ea
SET "direction_kind" = history_match."direction_kind"
FROM LATERAL (
	SELECT he."direction_kind"
	FROM "history_events" AS he
	WHERE he."position_id" = ea."position_id"
	ORDER BY he."occurred_at" DESC
	LIMIT 1
) AS history_match
WHERE ea."direction_kind" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "execution_attempts"
		WHERE "direction_kind" IS NULL
	) THEN
		RAISE EXCEPTION 'execution_attempts.direction_kind backfill failed for existing rows';
	END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "execution_attempts" ALTER COLUMN "direction_kind" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_direction_kind_check" CHECK ("execution_attempts"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach'));
--> statement-breakpoint
ALTER TABLE "history_events" ADD CONSTRAINT "history_events_direction_kind_check" CHECK ("history_events"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach'));
--> statement-breakpoint
ALTER TABLE "breach_episodes" ADD CONSTRAINT "breach_episodes_direction_kind_check" CHECK ("breach_episodes"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach'));
--> statement-breakpoint
ALTER TABLE "exit_triggers" ADD CONSTRAINT "exit_triggers_direction_kind_check" CHECK ("exit_triggers"."direction_kind" in ('lower-bound-breach', 'upper-bound-breach'));
