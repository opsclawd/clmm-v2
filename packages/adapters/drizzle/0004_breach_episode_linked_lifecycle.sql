DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'breach_episodes'
      AND column_name = 'active_trigger_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'breach_episodes'
      AND column_name = 'trigger_id'
  ) THEN
    ALTER TABLE "breach_episodes" RENAME COLUMN "active_trigger_id" TO "trigger_id";
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "breach_episodes" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open';
--> statement-breakpoint
ALTER TABLE "breach_episodes" ADD COLUMN IF NOT EXISTS "consecutive_count" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "breach_episodes" ADD COLUMN IF NOT EXISTS "closed_at" bigint;
--> statement-breakpoint
ALTER TABLE "breach_episodes" ADD COLUMN IF NOT EXISTS "close_reason" text;
--> statement-breakpoint
UPDATE "breach_episodes"
SET "status" = COALESCE("status", 'open');
--> statement-breakpoint
UPDATE "breach_episodes"
SET "consecutive_count" = COALESCE("consecutive_count", 1);
--> statement-breakpoint
ALTER TABLE "breach_episodes" ALTER COLUMN "status" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "breach_episodes" ALTER COLUMN "consecutive_count" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'breach_episodes_status_check'
  ) THEN
    ALTER TABLE "breach_episodes"
      ADD CONSTRAINT "breach_episodes_status_check"
      CHECK ("breach_episodes"."status" in ('open', 'closed'));
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'breach_episodes_closed_fields_consistency_check'
  ) THEN
    ALTER TABLE "breach_episodes"
      ADD CONSTRAINT "breach_episodes_closed_fields_consistency_check"
      CHECK ((
        ("breach_episodes"."status" = 'open' and "breach_episodes"."closed_at" is null and "breach_episodes"."close_reason" is null)
        or
        ("breach_episodes"."status" = 'closed' and "breach_episodes"."closed_at" is not null and "breach_episodes"."close_reason" is not null)
      ));
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "breach_episodes_one_open_episode_per_position_idx"
ON "breach_episodes" ("position_id")
WHERE "breach_episodes"."status" = 'open';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exit_triggers_episode_id_unique'
  ) THEN
    ALTER TABLE "exit_triggers"
      ADD CONSTRAINT "exit_triggers_episode_id_unique" UNIQUE ("episode_id");
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD COLUMN IF NOT EXISTS "episode_id" text;
