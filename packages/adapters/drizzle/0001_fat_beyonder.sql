CREATE TABLE "wallet_challenges" (
	"wallet_id" text PRIMARY KEY NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"issued_at" bigint NOT NULL
);
