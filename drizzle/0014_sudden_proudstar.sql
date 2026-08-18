CREATE TABLE "app"."agenda_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_kind" varchar(16) NOT NULL,
	"project_id" uuid,
	"task_id" uuid,
	"scheduled_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_entries_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "agenda_entries_workspace_project_unique" UNIQUE("workspace_id","project_id"),
	CONSTRAINT "agenda_entries_workspace_task_unique" UNIQUE("workspace_id","task_id"),
	CONSTRAINT "agenda_entries_workspace_kind_date_position_unique" UNIQUE NULLS NOT DISTINCT("workspace_id","entity_kind","scheduled_date","position"),
	CONSTRAINT "agenda_entries_entity_kind_allowed" CHECK ("app"."agenda_entries"."entity_kind" in ('project', 'task')),
	CONSTRAINT "agenda_entries_entity_consistent" CHECK (("app"."agenda_entries"."entity_kind" = 'project' and "app"."agenda_entries"."project_id" is not null and "app"."agenda_entries"."task_id" is null)
        or ("app"."agenda_entries"."entity_kind" = 'task' and "app"."agenda_entries"."task_id" is not null and "app"."agenda_entries"."project_id" is null)),
	CONSTRAINT "agenda_entries_position_non_negative" CHECK ("app"."agenda_entries"."position" >= 0),
	CONSTRAINT "agenda_entries_duration_range" CHECK ("app"."agenda_entries"."duration_minutes" between 30 and 10080),
	CONSTRAINT "agenda_entries_duration_half_hour" CHECK ("app"."agenda_entries"."duration_minutes" % 30 = 0),
	CONSTRAINT "agenda_entries_version_positive" CHECK ("app"."agenda_entries"."version" > 0),
	CONSTRAINT "agenda_entries_updated_not_before_creation" CHECK ("app"."agenda_entries"."updated_at" >= "app"."agenda_entries"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."agenda_entries" ADD CONSTRAINT "agenda_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."agenda_entries" ADD CONSTRAINT "agenda_entries_workspace_project_foreign_key" FOREIGN KEY ("workspace_id","project_id") REFERENCES "app"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."agenda_entries" ADD CONSTRAINT "agenda_entries_workspace_task_foreign_key" FOREIGN KEY ("workspace_id","task_id") REFERENCES "app"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_entries_workspace_kind_date_position_index" ON "app"."agenda_entries" USING btree ("workspace_id","entity_kind","scheduled_date","position","id");