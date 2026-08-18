CREATE TABLE "app"."tool_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"tool_key" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"config" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "tool_models_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "tool_models_tool_key_allowed" CHECK ("app"."tool_models"."tool_key" in ('form', 'evaluation', 'comparison', 'intensity')),
	CONSTRAINT "tool_models_name_not_blank" CHECK (length(btrim("app"."tool_models"."name")) > 0),
	CONSTRAINT "tool_models_config_object" CHECK (jsonb_typeof("app"."tool_models"."config") = 'object'),
	CONSTRAINT "tool_models_version_positive" CHECK ("app"."tool_models"."version" > 0),
	CONSTRAINT "tool_models_updated_not_before_creation" CHECK ("app"."tool_models"."updated_at" >= "app"."tool_models"."created_at"),
	CONSTRAINT "tool_models_archive_not_before_creation" CHECK ("app"."tool_models"."archived_at" is null or "app"."tool_models"."archived_at" >= "app"."tool_models"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."tool_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"use_id" uuid NOT NULL,
	"respondent_user_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"submitted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_responses_workspace_use_respondent_unique" UNIQUE("workspace_id","use_id","respondent_user_id"),
	CONSTRAINT "tool_responses_payload_object" CHECK (jsonb_typeof("app"."tool_responses"."payload") = 'object'),
	CONSTRAINT "tool_responses_submission_not_before_creation" CHECK ("app"."tool_responses"."submitted_at" >= "app"."tool_responses"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."tool_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"task_id" uuid,
	"tool_key" varchar(32) NOT NULL,
	"name" varchar(140) NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "tool_uses_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "tool_uses_tool_key_allowed" CHECK ("app"."tool_uses"."tool_key" in ('form', 'evaluation', 'comparison', 'intensity')),
	CONSTRAINT "tool_uses_status_allowed" CHECK ("app"."tool_uses"."status" in ('draft', 'open', 'completed', 'archived')),
	CONSTRAINT "tool_uses_name_not_blank" CHECK (length(btrim("app"."tool_uses"."name")) > 0),
	CONSTRAINT "tool_uses_json_objects" CHECK (jsonb_typeof("app"."tool_uses"."config_snapshot") = 'object' and jsonb_typeof("app"."tool_uses"."content") = 'object'),
	CONSTRAINT "tool_uses_version_positive" CHECK ("app"."tool_uses"."version" > 0),
	CONSTRAINT "tool_uses_completion_consistent" CHECK (("app"."tool_uses"."status" = 'completed' and "app"."tool_uses"."completed_at" is not null)
        or ("app"."tool_uses"."status" in ('draft', 'open') and "app"."tool_uses"."completed_at" is null)
        or "app"."tool_uses"."status" = 'archived'),
	CONSTRAINT "tool_uses_archive_consistent" CHECK (("app"."tool_uses"."status" = 'archived') = ("app"."tool_uses"."archived_at" is not null)),
	CONSTRAINT "tool_uses_updated_not_before_creation" CHECK ("app"."tool_uses"."updated_at" >= "app"."tool_uses"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."tool_models" ADD CONSTRAINT "tool_models_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tool_models" ADD CONSTRAINT "tool_models_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tool_responses" ADD CONSTRAINT "tool_responses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tool_responses" ADD CONSTRAINT "tool_responses_respondent_user_id_users_id_fk" FOREIGN KEY ("respondent_user_id") REFERENCES "app"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tool_responses" ADD CONSTRAINT "tool_responses_workspace_use_foreign_key" FOREIGN KEY ("workspace_id","use_id") REFERENCES "app"."tool_uses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tool_responses" ADD CONSTRAINT "tool_responses_workspace_member_foreign_key" FOREIGN KEY ("workspace_id","respondent_user_id") REFERENCES "app"."workspace_members"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tool_uses" ADD CONSTRAINT "tool_uses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tool_uses" ADD CONSTRAINT "tool_uses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tool_uses" ADD CONSTRAINT "tool_uses_workspace_model_foreign_key" FOREIGN KEY ("workspace_id","model_id") REFERENCES "app"."tool_models"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tool_uses" ADD CONSTRAINT "tool_uses_workspace_task_foreign_key" FOREIGN KEY ("workspace_id","task_id") REFERENCES "app"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tool_models_workspace_tool_archived_updated_index" ON "app"."tool_models" USING btree ("workspace_id","tool_key","archived_at","updated_at","id");--> statement-breakpoint
CREATE INDEX "tool_models_workspace_name_lower_index" ON "app"."tool_models" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "tool_responses_workspace_use_submitted_index" ON "app"."tool_responses" USING btree ("workspace_id","use_id","submitted_at","id");--> statement-breakpoint
CREATE INDEX "tool_uses_workspace_status_updated_index" ON "app"."tool_uses" USING btree ("workspace_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "tool_uses_workspace_tool_updated_index" ON "app"."tool_uses" USING btree ("workspace_id","tool_key","updated_at","id");--> statement-breakpoint
CREATE INDEX "tool_uses_workspace_task_index" ON "app"."tool_uses" USING btree ("workspace_id","task_id","updated_at");