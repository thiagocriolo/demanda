CREATE TABLE "app"."cronograma_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"subtask_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"start_minutes" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cronograma_blocks_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "cronograma_blocks_workspace_subtask_unique" UNIQUE("workspace_id","subtask_id"),
	CONSTRAINT "cronograma_blocks_start_half_hour" CHECK ("app"."cronograma_blocks"."start_minutes" between 0 and 1410 and "app"."cronograma_blocks"."start_minutes" % 30 = 0),
	CONSTRAINT "cronograma_blocks_duration_range" CHECK ("app"."cronograma_blocks"."duration_minutes" between 30 and 480),
	CONSTRAINT "cronograma_blocks_duration_half_hour" CHECK ("app"."cronograma_blocks"."duration_minutes" % 30 = 0),
	CONSTRAINT "cronograma_blocks_end_within_day" CHECK ("app"."cronograma_blocks"."start_minutes" + "app"."cronograma_blocks"."duration_minutes" <= 1440),
	CONSTRAINT "cronograma_blocks_version_positive" CHECK ("app"."cronograma_blocks"."version" > 0),
	CONSTRAINT "cronograma_blocks_updated_not_before_creation" CHECK ("app"."cronograma_blocks"."updated_at" >= "app"."cronograma_blocks"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."cronograma_blocks" ADD CONSTRAINT "cronograma_blocks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."cronograma_blocks" ADD CONSTRAINT "cronograma_blocks_workspace_task_foreign_key" FOREIGN KEY ("workspace_id","task_id") REFERENCES "app"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."task_subtasks" ADD CONSTRAINT "task_subtasks_workspace_id_task_unique" UNIQUE("workspace_id","id","task_id");--> statement-breakpoint
ALTER TABLE "app"."cronograma_blocks" ADD CONSTRAINT "cronograma_blocks_workspace_subtask_foreign_key" FOREIGN KEY ("workspace_id","subtask_id","task_id") REFERENCES "app"."task_subtasks"("workspace_id","id","task_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cronograma_blocks_workspace_date_start_index" ON "app"."cronograma_blocks" USING btree ("workspace_id","scheduled_date","start_minutes","id");--> statement-breakpoint
CREATE INDEX "cronograma_blocks_workspace_task_date_index" ON "app"."cronograma_blocks" USING btree ("workspace_id","task_id","scheduled_date","start_minutes");
