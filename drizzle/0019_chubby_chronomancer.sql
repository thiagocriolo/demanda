CREATE TABLE "app"."personal_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(80) NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_tasks_title_not_blank" CHECK (length(btrim("app"."personal_tasks"."title")) > 0),
	CONSTRAINT "personal_tasks_sort_order_nonnegative" CHECK ("app"."personal_tasks"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."personal_tasks" ADD CONSTRAINT "personal_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_tasks_user_order_index" ON "app"."personal_tasks" USING btree ("user_id","sort_order","created_at");