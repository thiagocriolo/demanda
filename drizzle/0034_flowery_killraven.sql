CREATE TABLE "app"."social_comment_likes" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_comment_likes_comment_user_primary_key" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "app"."social_post_comments" ADD COLUMN "parent_comment_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."social_post_comments" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."social_comment_likes" ADD CONSTRAINT "social_comment_likes_comment_id_social_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "app"."social_post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."social_comment_likes" ADD CONSTRAINT "social_comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_comment_likes_user_created_index" ON "app"."social_comment_likes" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "app"."social_post_comments" ADD CONSTRAINT "social_post_comments_parent_comment_id_social_post_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "app"."social_post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_post_comments_parent_created_index" ON "app"."social_post_comments" USING btree ("parent_comment_id","created_at");--> statement-breakpoint
ALTER TABLE "app"."social_post_comments" ADD CONSTRAINT "social_post_comments_depth_allowed" CHECK ("app"."social_post_comments"."depth" between 0 and 10);