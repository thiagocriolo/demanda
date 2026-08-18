CREATE TABLE "app"."communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"cover_file_id" uuid,
	"name" varchar(80) NOT NULL,
	"description" varchar(240) NOT NULL,
	"topic" varchar(60) NOT NULL,
	"visibility" varchar(16) DEFAULT 'public' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "communities_name_not_blank" CHECK (length(btrim("app"."communities"."name")) > 0),
	CONSTRAINT "communities_description_not_blank" CHECK (length(btrim("app"."communities"."description")) > 0),
	CONSTRAINT "communities_topic_not_blank" CHECK (length(btrim("app"."communities"."topic")) > 0),
	CONSTRAINT "communities_visibility_allowed" CHECK ("app"."communities"."visibility" in ('public', 'private'))
);
--> statement-breakpoint
CREATE TABLE "app"."community_members" (
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_members_community_id_user_id_pk" PRIMARY KEY("community_id","user_id"),
	CONSTRAINT "community_members_role_allowed" CHECK ("app"."community_members"."role" in ('owner', 'admin', 'member'))
);
--> statement-breakpoint
ALTER TABLE "app"."social_posts" ADD COLUMN "community_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."communities" ADD CONSTRAINT "communities_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."communities" ADD CONSTRAINT "communities_cover_file_id_stored_files_id_fk" FOREIGN KEY ("cover_file_id") REFERENCES "app"."stored_files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."community_members" ADD CONSTRAINT "community_members_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "app"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."community_members" ADD CONSTRAINT "community_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communities_owner_created_index" ON "app"."communities" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "communities_cover_file_index" ON "app"."communities" USING btree ("cover_file_id");--> statement-breakpoint
CREATE INDEX "community_members_user_joined_index" ON "app"."community_members" USING btree ("user_id","joined_at");--> statement-breakpoint
ALTER TABLE "app"."social_posts" ADD CONSTRAINT "social_posts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "app"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_posts_community_created_index" ON "app"."social_posts" USING btree ("community_id","created_at");