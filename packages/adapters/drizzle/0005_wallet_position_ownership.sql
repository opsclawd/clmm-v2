CREATE TABLE "wallet_position_ownership" (
	"wallet_id" text NOT NULL,
	"position_id" text NOT NULL,
	"first_seen_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	CONSTRAINT "wallet_position_ownership_wallet_position_unique" UNIQUE ("wallet_id", "position_id")
);
--> statement-breakpoint
CREATE INDEX "wallet_position_ownership_wallet_id_idx" ON "wallet_position_ownership" ("wallet_id");