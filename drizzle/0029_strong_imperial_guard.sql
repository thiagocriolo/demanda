CREATE TABLE "app"."connection_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_requests_user_pair_unique" UNIQUE("user_a_id","user_b_id"),
	CONSTRAINT "connection_requests_canonical_pair" CHECK ("app"."connection_requests"."user_a_id" < "app"."connection_requests"."user_b_id"),
	CONSTRAINT "connection_requests_requester_in_pair" CHECK ("app"."connection_requests"."requested_by_user_id" = "app"."connection_requests"."user_a_id" or "app"."connection_requests"."requested_by_user_id" = "app"."connection_requests"."user_b_id"),
	CONSTRAINT "connection_requests_status_allowed" CHECK ("app"."connection_requests"."status" in ('pending', 'accepted', 'declined', 'cancelled')),
	CONSTRAINT "connection_requests_response_consistent" CHECK (("app"."connection_requests"."status" = 'pending' and "app"."connection_requests"."responded_at" is null) or ("app"."connection_requests"."status" <> 'pending' and "app"."connection_requests"."responded_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "app"."social_post_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"text_content" text,
	"file_id" uuid,
	"caption" varchar(240),
	"position" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_post_blocks_post_position_unique" UNIQUE("post_id","position"),
	CONSTRAINT "social_post_blocks_kind_allowed" CHECK ("app"."social_post_blocks"."kind" in ('text', 'image')),
	CONSTRAINT "social_post_blocks_position_non_negative" CHECK ("app"."social_post_blocks"."position" >= 0),
	CONSTRAINT "social_post_blocks_content_consistent" CHECK (("app"."social_post_blocks"."kind" = 'text' and nullif(btrim(coalesce("app"."social_post_blocks"."text_content", '')), '') is not null and "app"."social_post_blocks"."file_id" is null)
        or ("app"."social_post_blocks"."kind" = 'image' and "app"."social_post_blocks"."file_id" is not null and "app"."social_post_blocks"."text_content" is null))
);
--> statement-breakpoint
CREATE TABLE "app"."social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"title" varchar(160),
	"body" text,
	"link_url" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "social_posts_kind_allowed" CHECK ("app"."social_posts"."kind" in ('feed', 'portfolio')),
	CONSTRAINT "social_posts_portfolio_has_title" CHECK ("app"."social_posts"."kind" <> 'portfolio' or nullif(btrim(coalesce("app"."social_posts"."title", '')), '') is not null)
);
--> statement-breakpoint
ALTER TABLE "app"."connection_requests" ADD CONSTRAINT "connection_requests_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."connection_requests" ADD CONSTRAINT "connection_requests_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."connection_requests" ADD CONSTRAINT "connection_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."social_post_blocks" ADD CONSTRAINT "social_post_blocks_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "app"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."social_post_blocks" ADD CONSTRAINT "social_post_blocks_file_id_stored_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "app"."stored_files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."social_posts" ADD CONSTRAINT "social_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connection_requests_recipient_status_index" ON "app"."connection_requests" USING btree ("user_b_id","status","created_at");--> statement-breakpoint
CREATE INDEX "social_post_blocks_file_id_index" ON "app"."social_post_blocks" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "social_posts_author_created_index" ON "app"."social_posts" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "social_posts_kind_created_index" ON "app"."social_posts" USING btree ("kind","created_at");