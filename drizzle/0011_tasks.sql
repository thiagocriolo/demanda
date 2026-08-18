CREATE TABLE "app"."task_responsibles" (
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_responsibles_workspace_task_user_primary_key" PRIMARY KEY("workspace_id","task_id","user_id"),
	CONSTRAINT "task_responsibles_sort_order_non_negative" CHECK ("app"."task_responsibles"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."task_subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"status_key" varchar(64) DEFAULT 'pendente' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "task_subtasks_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_subtasks_name_not_blank" CHECK (length(btrim("app"."task_subtasks"."name")) > 0),
	CONSTRAINT "task_subtasks_duration_range" CHECK ("app"."task_subtasks"."duration_minutes" between 30 and 10080),
	CONSTRAINT "task_subtasks_duration_half_hour" CHECK ("app"."task_subtasks"."duration_minutes" % 30 = 0),
	CONSTRAINT "task_subtasks_status_normalized" CHECK ("app"."task_subtasks"."status_key" = lower(btrim("app"."task_subtasks"."status_key"))),
	CONSTRAINT "task_subtasks_status_format" CHECK ("app"."task_subtasks"."status_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "task_subtasks_status_not_archived" CHECK ("app"."task_subtasks"."status_key" <> 'arquivado'),
	CONSTRAINT "task_subtasks_completion_status_consistent" CHECK (("app"."task_subtasks"."status_key" = 'concluida') = ("app"."task_subtasks"."completed_at" is not null)),
	CONSTRAINT "task_subtasks_sort_order_non_negative" CHECK ("app"."task_subtasks"."sort_order" >= 0),
	CONSTRAINT "task_subtasks_updated_not_before_creation" CHECK ("app"."task_subtasks"."updated_at" >= "app"."task_subtasks"."created_at"),
	CONSTRAINT "task_subtasks_completion_not_before_creation" CHECK ("app"."task_subtasks"."completed_at" is null or "app"."task_subtasks"."completed_at" >= "app"."task_subtasks"."created_at"),
	CONSTRAINT "task_subtasks_archive_not_before_creation" CHECK ("app"."task_subtasks"."archived_at" is null or "app"."task_subtasks"."archived_at" >= "app"."task_subtasks"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."task_tags" (
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_tags_workspace_task_tag_primary_key" PRIMARY KEY("workspace_id","task_id","tag_id"),
	CONSTRAINT "task_tags_sort_order_non_negative" CHECK ("app"."task_tags"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"name" varchar(140) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_key" varchar(64),
	"priority_key" varchar(64) DEFAULT 'normal' NOT NULL,
	"status_key" varchar(64) DEFAULT 'planejamento' NOT NULL,
	"due_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"board_order" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "tasks_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "tasks_name_not_blank" CHECK (length(btrim("app"."tasks"."name")) > 0),
	CONSTRAINT "tasks_category_normalized" CHECK ("app"."tasks"."category_key" is null or "app"."tasks"."category_key" = lower(btrim("app"."tasks"."category_key"))),
	CONSTRAINT "tasks_category_format" CHECK ("app"."tasks"."category_key" is null or "app"."tasks"."category_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "tasks_priority_normalized" CHECK ("app"."tasks"."priority_key" = lower(btrim("app"."tasks"."priority_key"))),
	CONSTRAINT "tasks_priority_format" CHECK ("app"."tasks"."priority_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "tasks_status_normalized" CHECK ("app"."tasks"."status_key" = lower(btrim("app"."tasks"."status_key"))),
	CONSTRAINT "tasks_status_format" CHECK ("app"."tasks"."status_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "tasks_status_not_archived" CHECK ("app"."tasks"."status_key" <> 'arquivado'),
	CONSTRAINT "tasks_completion_status_consistent" CHECK (("app"."tasks"."status_key" = 'conclusao') = ("app"."tasks"."completed_at" is not null)),
	CONSTRAINT "tasks_sort_order_non_negative" CHECK ("app"."tasks"."sort_order" >= 0),
	CONSTRAINT "tasks_version_positive" CHECK ("app"."tasks"."version" > 0),
	CONSTRAINT "tasks_board_order_shape" CHECK (jsonb_typeof("app"."tasks"."board_order") = 'object'
        and "app"."tasks"."board_order" - 'status' - 'priority' - 'business' - 'project' = '{}'::jsonb
        and (not ("app"."tasks"."board_order" ? 'status') or
          (jsonb_typeof("app"."tasks"."board_order"->'status') = 'number' and
           "app"."tasks"."board_order"->>'status' ~ '^[0-9]{1,9}$'))
        and (not ("app"."tasks"."board_order" ? 'priority') or
          (jsonb_typeof("app"."tasks"."board_order"->'priority') = 'number' and
           "app"."tasks"."board_order"->>'priority' ~ '^[0-9]{1,9}$'))
        and (not ("app"."tasks"."board_order" ? 'business') or
          (jsonb_typeof("app"."tasks"."board_order"->'business') = 'number' and
           "app"."tasks"."board_order"->>'business' ~ '^[0-9]{1,9}$'))
        and (not ("app"."tasks"."board_order" ? 'project') or
          (jsonb_typeof("app"."tasks"."board_order"->'project') = 'number' and
           "app"."tasks"."board_order"->>'project' ~ '^[0-9]{1,9}$'))),
	CONSTRAINT "tasks_updated_not_before_creation" CHECK ("app"."tasks"."updated_at" >= "app"."tasks"."created_at"),
	CONSTRAINT "tasks_completion_not_before_creation" CHECK ("app"."tasks"."completed_at" is null or "app"."tasks"."completed_at" >= "app"."tasks"."created_at"),
	CONSTRAINT "tasks_archive_not_before_creation" CHECK ("app"."tasks"."archived_at" is null or "app"."tasks"."archived_at" >= "app"."tasks"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."task_responsibles" ADD CONSTRAINT "task_responsibles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_responsibles" ADD CONSTRAINT "task_responsibles_workspace_task_foreign_key" FOREIGN KEY ("workspace_id","task_id") REFERENCES "app"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_responsibles" ADD CONSTRAINT "task_responsibles_workspace_member_foreign_key" FOREIGN KEY ("workspace_id","user_id") REFERENCES "app"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_subtasks" ADD CONSTRAINT "task_subtasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_subtasks" ADD CONSTRAINT "task_subtasks_workspace_task_foreign_key" FOREIGN KEY ("workspace_id","task_id") REFERENCES "app"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_tags" ADD CONSTRAINT "task_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_tags" ADD CONSTRAINT "task_tags_workspace_task_foreign_key" FOREIGN KEY ("workspace_id","task_id") REFERENCES "app"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_tags" ADD CONSTRAINT "task_tags_workspace_tag_foreign_key" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "app"."tags"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_workspace_id_business_id_unique" UNIQUE("workspace_id","id","business_id");--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_workspace_project_business_foreign_key" FOREIGN KEY ("workspace_id","project_id","business_id") REFERENCES "app"."projects"("workspace_id","id","business_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_workspace_business_foreign_key" FOREIGN KEY ("workspace_id","business_id") REFERENCES "app"."businesses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_responsibles_workspace_task_order_index" ON "app"."task_responsibles" USING btree ("workspace_id","task_id","sort_order","user_id");--> statement-breakpoint
CREATE INDEX "task_responsibles_workspace_user_task_index" ON "app"."task_responsibles" USING btree ("workspace_id","user_id","task_id");--> statement-breakpoint
CREATE INDEX "task_subtasks_workspace_task_archived_order_index" ON "app"."task_subtasks" USING btree ("workspace_id","task_id","archived_at","sort_order","id");--> statement-breakpoint
CREATE INDEX "task_subtasks_workspace_status_completion_index" ON "app"."task_subtasks" USING btree ("workspace_id","status_key","completed_at","id");--> statement-breakpoint
CREATE INDEX "task_tags_workspace_task_order_index" ON "app"."task_tags" USING btree ("workspace_id","task_id","sort_order","tag_id");--> statement-breakpoint
CREATE INDEX "task_tags_workspace_tag_task_index" ON "app"."task_tags" USING btree ("workspace_id","tag_id","task_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_updated_id_index" ON "app"."tasks" USING btree ("workspace_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_project_archived_order_index" ON "app"."tasks" USING btree ("workspace_id","project_id","archived_at","sort_order","id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_business_archived_order_index" ON "app"."tasks" USING btree ("workspace_id","business_id","archived_at","sort_order","id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_status_archived_order_index" ON "app"."tasks" USING btree ("workspace_id","status_key","archived_at","sort_order","id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_priority_archived_order_index" ON "app"."tasks" USING btree ("workspace_id","priority_key","archived_at","sort_order","id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_due_completion_archive_index" ON "app"."tasks" USING btree ("workspace_id","due_date","completed_at","archived_at","id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_name_lower_index" ON "app"."tasks" USING btree ("workspace_id",lower("name"));
