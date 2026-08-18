CREATE TABLE "app"."community_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"invited_user_id" uuid NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"invited_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp (3) with time zone,
	CONSTRAINT "community_invitations_status_allowed" CHECK ("app"."community_invitations"."status" in ('pending', 'accepted'))
);
--> statement-breakpoint
ALTER TABLE "app"."community_invitations" ADD CONSTRAINT "community_invitations_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "app"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."community_invitations" ADD CONSTRAINT "community_invitations_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."community_invitations" ADD CONSTRAINT "community_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_invitations_community_user_unique" ON "app"."community_invitations" USING btree ("community_id","invited_user_id");--> statement-breakpoint
CREATE INDEX "community_invitations_invited_user_status_index" ON "app"."community_invitations" USING btree ("invited_user_id","status","invited_at");