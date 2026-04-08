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
