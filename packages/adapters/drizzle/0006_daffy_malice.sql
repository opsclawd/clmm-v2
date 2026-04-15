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
CREATE INDEX "notification_events_trigger_id_idx" ON "notification_events" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "notification_events_status_idx" ON "notification_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_events_created_at_idx" ON "notification_events" USING btree ("created_at");--> statement-breakpoint
