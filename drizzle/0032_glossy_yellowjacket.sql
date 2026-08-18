CREATE TABLE "app"."community_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp (3) with time zone,
	"reviewed_by_user_id" uuid,
	CONSTRAINT "community_join_requests_status_allowed" CHECK ("app"."community_join_requests"."status" in ('pending', 'accepted', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "app"."community_join_requests" ADD CONSTRAINT "community_join_requests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "app"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."community_join_requests" ADD CONSTRAINT "community_join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."community_join_requests" ADD CONSTRAINT "community_join_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_join_requests_community_user_unique" ON "app"."community_join_requests" USING btree ("community_id","user_id");--> statement-breakpoint
CREATE INDEX "community_join_requests_pending_index" ON "app"."community_join_requests" USING btree ("community_id","status","requested_at");