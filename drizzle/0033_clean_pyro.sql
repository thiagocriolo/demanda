CREATE TABLE "app"."social_post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "social_post_comments_body_not_blank" CHECK (nullif(btrim("app"."social_post_comments"."body"), '') is not null)
);
--> statement-breakpoint
CREATE TABLE "app"."social_post_likes" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_post_likes_post_user_primary_key" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "app"."social_post_comments" ADD CONSTRAINT "social_post_comments_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "app"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."social_post_comments" ADD CONSTRAINT "social_post_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."social_post_likes" ADD CONSTRAINT "social_post_likes_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "app"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."social_post_likes" ADD CONSTRAINT "social_post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_post_comments_post_created_index" ON "app"."social_post_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "social_post_comments_author_index" ON "app"."social_post_comments" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "social_post_likes_user_created_index" ON "app"."social_post_likes" USING btree ("user_id","created_at");