CREATE TABLE "app"."delivery_template_responsibles" (
	"workspace_id" uuid NOT NULL,
	"delivery_template_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "delivery_template_responsibles_workspace_template_user_primary_key" PRIMARY KEY("workspace_id","delivery_template_id","user_id"),
	CONSTRAINT "delivery_template_responsibles_sort_order_non_negative" CHECK ("app"."delivery_template_responsibles"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."delivery_template_subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"delivery_template_id" uuid NOT NULL,
	"name" varchar(140) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"default_status_key" varchar(64) DEFAULT 'pendente' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_template_subtasks_name_not_blank" CHECK (length(btrim("app"."delivery_template_subtasks"."name")) > 0),
	CONSTRAINT "delivery_template_subtasks_duration_range" CHECK ("app"."delivery_template_subtasks"."duration_minutes" between 30 and 10080),
	CONSTRAINT "delivery_template_subtasks_duration_half_hour" CHECK ("app"."delivery_template_subtasks"."duration_minutes" % 30 = 0),
	CONSTRAINT "delivery_template_subtasks_status_normalized" CHECK ("app"."delivery_template_subtasks"."default_status_key" = lower(btrim("app"."delivery_template_subtasks"."default_status_key"))),
	CONSTRAINT "delivery_template_subtasks_status_format" CHECK ("app"."delivery_template_subtasks"."default_status_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "delivery_template_subtasks_sort_order_non_negative" CHECK ("app"."delivery_template_subtasks"."sort_order" >= 0),
	CONSTRAINT "delivery_template_subtasks_updated_not_before_creation" CHECK ("app"."delivery_template_subtasks"."updated_at" >= "app"."delivery_template_subtasks"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."delivery_template_tags" (
	"workspace_id" uuid NOT NULL,
	"delivery_template_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "delivery_template_tags_workspace_template_tag_primary_key" PRIMARY KEY("workspace_id","delivery_template_id","tag_id"),
	CONSTRAINT "delivery_template_tags_sort_order_non_negative" CHECK ("app"."delivery_template_tags"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."delivery_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"service_id" uuid,
	"name" varchar(140) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_key" varchar(64),
	"default_status_key" varchar(64) DEFAULT 'planejamento' NOT NULL,
	"default_priority_key" varchar(64) DEFAULT 'normal' NOT NULL,
	"default_duration_minutes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "delivery_templates_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "delivery_templates_name_not_blank" CHECK (length(btrim("app"."delivery_templates"."name")) > 0),
	CONSTRAINT "delivery_templates_category_normalized" CHECK ("app"."delivery_templates"."category_key" is null or "app"."delivery_templates"."category_key" = lower(btrim("app"."delivery_templates"."category_key"))),
	CONSTRAINT "delivery_templates_category_format" CHECK ("app"."delivery_templates"."category_key" is null or "app"."delivery_templates"."category_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "delivery_templates_status_normalized" CHECK ("app"."delivery_templates"."default_status_key" = lower(btrim("app"."delivery_templates"."default_status_key"))),
	CONSTRAINT "delivery_templates_status_format" CHECK ("app"."delivery_templates"."default_status_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "delivery_templates_status_not_archived" CHECK ("app"."delivery_templates"."default_status_key" <> 'arquivado'),
	CONSTRAINT "delivery_templates_priority_normalized" CHECK ("app"."delivery_templates"."default_priority_key" = lower(btrim("app"."delivery_templates"."default_priority_key"))),
	CONSTRAINT "delivery_templates_priority_format" CHECK ("app"."delivery_templates"."default_priority_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "delivery_templates_duration_range" CHECK ("app"."delivery_templates"."default_duration_minutes" is null or "app"."delivery_templates"."default_duration_minutes" between 30 and 10080),
	CONSTRAINT "delivery_templates_duration_half_hour" CHECK ("app"."delivery_templates"."default_duration_minutes" is null or "app"."delivery_templates"."default_duration_minutes" % 30 = 0),
	CONSTRAINT "delivery_templates_sort_order_non_negative" CHECK ("app"."delivery_templates"."sort_order" >= 0),
	CONSTRAINT "delivery_templates_version_positive" CHECK ("app"."delivery_templates"."version" > 0),
	CONSTRAINT "delivery_templates_updated_not_before_creation" CHECK ("app"."delivery_templates"."updated_at" >= "app"."delivery_templates"."created_at"),
	CONSTRAINT "delivery_templates_archive_not_before_creation" CHECK ("app"."delivery_templates"."archived_at" is null or "app"."delivery_templates"."archived_at" >= "app"."delivery_templates"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_version_positive" CHECK ("app"."user_preferences"."version" > 0),
	CONSTRAINT "user_preferences_settings_object" CHECK (jsonb_typeof("app"."user_preferences"."settings") = 'object'),
	CONSTRAINT "user_preferences_updated_not_before_creation" CHECK ("app"."user_preferences"."updated_at" >= "app"."user_preferences"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."workspace_catalog_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(80) NOT NULL,
	"icon" varchar(80),
	"color" varchar(32),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "workspace_catalog_entries_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "workspace_catalog_entries_workspace_kind_key_unique" UNIQUE("workspace_id","kind","key"),
	CONSTRAINT "workspace_catalog_entries_kind_allowed" CHECK ("app"."workspace_catalog_entries"."kind" in ('person_status', 'business_status', 'project_status', 'task_status', 'business_category', 'task_category', 'task_priority', 'revenue_category', 'expense_category')),
	CONSTRAINT "workspace_catalog_entries_key_normalized" CHECK ("app"."workspace_catalog_entries"."key" = lower(btrim("app"."workspace_catalog_entries"."key"))),
	CONSTRAINT "workspace_catalog_entries_key_format" CHECK ("app"."workspace_catalog_entries"."key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "workspace_catalog_entries_label_not_blank" CHECK (length(btrim("app"."workspace_catalog_entries"."label")) > 0),
	CONSTRAINT "workspace_catalog_entries_sort_order_non_negative" CHECK ("app"."workspace_catalog_entries"."sort_order" >= 0),
	CONSTRAINT "workspace_catalog_entries_version_positive" CHECK ("app"."workspace_catalog_entries"."version" > 0),
	CONSTRAINT "workspace_catalog_entries_updated_not_before_creation" CHECK ("app"."workspace_catalog_entries"."updated_at" >= "app"."workspace_catalog_entries"."created_at"),
	CONSTRAINT "workspace_catalog_entries_archive_not_before_creation" CHECK ("app"."workspace_catalog_entries"."archived_at" is null or "app"."workspace_catalog_entries"."archived_at" >= "app"."workspace_catalog_entries"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."workspace_configurations" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_configurations_version_positive" CHECK ("app"."workspace_configurations"."version" > 0),
	CONSTRAINT "workspace_configurations_updated_not_before_creation" CHECK ("app"."workspace_configurations"."updated_at" >= "app"."workspace_configurations"."created_at")
);
--> statement-breakpoint
DROP INDEX "app"."tags_workspace_archived_key_index";--> statement-breakpoint
ALTER TABLE "app"."services" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."services" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."tags" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."tags" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."delivery_template_responsibles" ADD CONSTRAINT "delivery_template_responsibles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."delivery_template_responsibles" ADD CONSTRAINT "delivery_template_responsibles_workspace_template_foreign_key" FOREIGN KEY ("workspace_id","delivery_template_id") REFERENCES "app"."delivery_templates"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."delivery_template_responsibles" ADD CONSTRAINT "delivery_template_responsibles_workspace_member_foreign_key" FOREIGN KEY ("workspace_id","user_id") REFERENCES "app"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."delivery_template_subtasks" ADD CONSTRAINT "delivery_template_subtasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."delivery_template_subtasks" ADD CONSTRAINT "delivery_template_subtasks_workspace_template_foreign_key" FOREIGN KEY ("workspace_id","delivery_template_id") REFERENCES "app"."delivery_templates"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."delivery_template_tags" ADD CONSTRAINT "delivery_template_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."delivery_template_tags" ADD CONSTRAINT "delivery_template_tags_workspace_template_foreign_key" FOREIGN KEY ("workspace_id","delivery_template_id") REFERENCES "app"."delivery_templates"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."delivery_template_tags" ADD CONSTRAINT "delivery_template_tags_workspace_tag_foreign_key" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "app"."tags"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."delivery_templates" ADD CONSTRAINT "delivery_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."delivery_templates" ADD CONSTRAINT "delivery_templates_workspace_service_foreign_key" FOREIGN KEY ("workspace_id","service_id") REFERENCES "app"."services"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_catalog_entries" ADD CONSTRAINT "workspace_catalog_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_configurations" ADD CONSTRAINT "workspace_configurations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_template_subtasks_workspace_template_order_index" ON "app"."delivery_template_subtasks" USING btree ("workspace_id","delivery_template_id","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_templates_workspace_active_name_unique" ON "app"."delivery_templates" USING btree ("workspace_id",lower("name")) WHERE "app"."delivery_templates"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "delivery_templates_workspace_service_order_index" ON "app"."delivery_templates" USING btree ("workspace_id","service_id","archived_at","sort_order","id");--> statement-breakpoint
CREATE INDEX "workspace_catalog_entries_workspace_kind_order_index" ON "app"."workspace_catalog_entries" USING btree ("workspace_id","kind","archived_at","sort_order","id");--> statement-breakpoint
CREATE INDEX "services_workspace_archived_order_index" ON "app"."services" USING btree ("workspace_id","archived_at","sort_order","id");--> statement-breakpoint
CREATE INDEX "tags_workspace_archived_key_index" ON "app"."tags" USING btree ("workspace_id","archived_at","sort_order","key");--> statement-breakpoint
ALTER TABLE "app"."services" ADD CONSTRAINT "services_sort_order_non_negative" CHECK ("app"."services"."sort_order" >= 0);--> statement-breakpoint
ALTER TABLE "app"."services" ADD CONSTRAINT "services_version_positive" CHECK ("app"."services"."version" > 0);--> statement-breakpoint
ALTER TABLE "app"."tags" ADD CONSTRAINT "tags_sort_order_non_negative" CHECK ("app"."tags"."sort_order" >= 0);--> statement-breakpoint
ALTER TABLE "app"."tags" ADD CONSTRAINT "tags_version_positive" CHECK ("app"."tags"."version" > 0);