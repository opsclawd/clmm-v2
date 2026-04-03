CREATE TABLE IF NOT EXISTS "prepared_payloads" (
	"payload_id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL UNIQUE,
	"unsigned_payload" bytea NOT NULL,
	"payload_version" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_attempts" ADD COLUMN IF NOT EXISTS "preview_id" text;
