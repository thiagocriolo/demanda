CREATE TABLE "app"."project_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status_key" varchar(64),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_installments_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "project_installments_project_number_unique" UNIQUE("workspace_id","project_id","number"),
	CONSTRAINT "project_installments_number_range" CHECK ("app"."project_installments"."number" between 1 and 999),
	CONSTRAINT "project_installments_amount_safe" CHECK ("app"."project_installments"."amount_cents" between 0 and 9007199254740991),
	CONSTRAINT "project_installments_status_normalized" CHECK ("app"."project_installments"."status_key" is null or "app"."project_installments"."status_key" = lower(btrim("app"."project_installments"."status_key"))),
	CONSTRAINT "project_installments_status_format" CHECK ("app"."project_installments"."status_key" is null or "app"."project_installments"."status_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "project_installments_updated_not_before_creation" CHECK ("app"."project_installments"."updated_at" >= "app"."project_installments"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."project_responsibles" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "project_responsibles_workspace_project_user_primary_key" PRIMARY KEY("workspace_id","project_id","user_id"),
	CONSTRAINT "project_responsibles_sort_order_non_negative" CHECK ("app"."project_responsibles"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."project_services" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "project_services_workspace_project_service_primary_key" PRIMARY KEY("workspace_id","project_id","service_id"),
	CONSTRAINT "project_services_sort_order_non_negative" CHECK ("app"."project_services"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."project_tags" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "project_tags_workspace_project_tag_primary_key" PRIMARY KEY("workspace_id","project_id","tag_id"),
	CONSTRAINT "project_tags_sort_order_non_negative" CHECK ("app"."project_tags"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"source_service_id" uuid,
	"name" varchar(140) NOT NULL,
	"status_key" varchar(64) NOT NULL,
	"briefing" text DEFAULT '' NOT NULL,
	"start_date" date,
	"end_date" date,
	"contract_type" varchar(16) DEFAULT 'one_off' NOT NULL,
	"amount_cents" bigint,
	"first_due_date" date,
	"payment_method" varchar(120),
	"payment_terms" text,
	"finance_notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "projects_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "projects_name_not_blank" CHECK (length(btrim("app"."projects"."name")) > 0),
	CONSTRAINT "projects_status_key_normalized" CHECK ("app"."projects"."status_key" = lower(btrim("app"."projects"."status_key"))),
	CONSTRAINT "projects_status_key_format" CHECK ("app"."projects"."status_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "projects_status_not_archived" CHECK ("app"."projects"."status_key" <> 'arquivado'),
	CONSTRAINT "projects_contract_type_allowed" CHECK ("app"."projects"."contract_type" in ('one_off', 'recurring')),
	CONSTRAINT "projects_amount_cents_safe" CHECK ("app"."projects"."amount_cents" is null or "app"."projects"."amount_cents" between 0 and 9007199254740991),
	CONSTRAINT "projects_dates_ordered" CHECK ("app"."projects"."start_date" is null or "app"."projects"."end_date" is null or "app"."projects"."end_date" >= "app"."projects"."start_date"),
	CONSTRAINT "projects_payment_method_not_blank" CHECK ("app"."projects"."payment_method" is null or length(btrim("app"."projects"."payment_method")) > 0),
	CONSTRAINT "projects_updated_not_before_creation" CHECK ("app"."projects"."updated_at" >= "app"."projects"."created_at"),
	CONSTRAINT "projects_archive_not_before_creation" CHECK ("app"."projects"."archived_at" is null or "app"."projects"."archived_at" >= "app"."projects"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."service_responsibles" (
	"workspace_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_responsibles_workspace_service_user_primary_key" PRIMARY KEY("workspace_id","service_id","user_id"),
	CONSTRAINT "service_responsibles_sort_order_non_negative" CHECK ("app"."service_responsibles"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."service_tags" (
	"workspace_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_tags_workspace_service_tag_primary_key" PRIMARY KEY("workspace_id","service_id","tag_id"),
	CONSTRAINT "service_tags_sort_order_non_negative" CHECK ("app"."service_tags"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(140) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"default_briefing" text DEFAULT '' NOT NULL,
	"icon" varchar(80) DEFAULT 'briefcase-business' NOT NULL,
	"color" varchar(32) DEFAULT 'blue' NOT NULL,
	"default_status_key" varchar(64) DEFAULT 'planejamento' NOT NULL,
	"default_duration_days" integer,
	"default_contract_type" varchar(16) DEFAULT 'one_off' NOT NULL,
	"default_amount_cents" bigint,
	"default_installment_count" integer DEFAULT 1 NOT NULL,
	"default_payment_method" varchar(120),
	"default_payment_terms" text,
	"default_finance_notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "services_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "services_name_not_blank" CHECK (length(btrim("app"."services"."name")) > 0),
	CONSTRAINT "services_default_status_normalized" CHECK ("app"."services"."default_status_key" = lower(btrim("app"."services"."default_status_key"))),
	CONSTRAINT "services_default_status_format" CHECK ("app"."services"."default_status_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "services_default_status_not_archived" CHECK ("app"."services"."default_status_key" <> 'arquivado'),
	CONSTRAINT "services_default_duration_range" CHECK ("app"."services"."default_duration_days" is null or "app"."services"."default_duration_days" between 1 and 3650),
	CONSTRAINT "services_default_contract_allowed" CHECK ("app"."services"."default_contract_type" in ('one_off', 'recurring')),
	CONSTRAINT "services_default_amount_safe" CHECK ("app"."services"."default_amount_cents" is null or "app"."services"."default_amount_cents" between 0 and 9007199254740991),
	CONSTRAINT "services_default_installment_count_range" CHECK ("app"."services"."default_installment_count" between 1 and 99),
	CONSTRAINT "services_payment_method_not_blank" CHECK ("app"."services"."default_payment_method" is null or length(btrim("app"."services"."default_payment_method")) > 0),
	CONSTRAINT "services_updated_not_before_creation" CHECK ("app"."services"."updated_at" >= "app"."services"."created_at"),
	CONSTRAINT "services_archive_not_before_creation" CHECK ("app"."services"."archived_at" is null or "app"."services"."archived_at" >= "app"."services"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(80) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "tags_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "tags_workspace_key_unique" UNIQUE("workspace_id","key"),
	CONSTRAINT "tags_label_not_blank" CHECK (length(btrim("app"."tags"."label")) > 0),
	CONSTRAINT "tags_key_normalized" CHECK ("app"."tags"."key" = lower(btrim("app"."tags"."key"))),
	CONSTRAINT "tags_key_format" CHECK ("app"."tags"."key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "tags_updated_not_before_creation" CHECK ("app"."tags"."updated_at" >= "app"."tags"."created_at"),
	CONSTRAINT "tags_archive_not_before_creation" CHECK ("app"."tags"."archived_at" is null or "app"."tags"."archived_at" >= "app"."tags"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."project_installments" ADD CONSTRAINT "project_installments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."project_installments" ADD CONSTRAINT "project_installments_workspace_project_foreign_key" FOREIGN KEY ("workspace_id","project_id") REFERENCES "app"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."project_responsibles" ADD CONSTRAINT "project_responsibles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."project_responsibles" ADD CONSTRAINT "project_responsibles_workspace_project_foreign_key" FOREIGN KEY ("workspace_id","project_id") REFERENCES "app"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."project_responsibles" ADD CONSTRAINT "project_responsibles_workspace_member_foreign_key" FOREIGN KEY ("workspace_id","user_id") REFERENCES "app"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."project_services" ADD CONSTRAINT "project_services_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."project_services" ADD CONSTRAINT "project_services_workspace_project_foreign_key" FOREIGN KEY ("workspace_id","project_id") REFERENCES "app"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."project_services" ADD CONSTRAINT "project_services_workspace_service_foreign_key" FOREIGN KEY ("workspace_id","service_id") REFERENCES "app"."services"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."project_tags" ADD CONSTRAINT "project_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."project_tags" ADD CONSTRAINT "project_tags_workspace_project_foreign_key" FOREIGN KEY ("workspace_id","project_id") REFERENCES "app"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."project_tags" ADD CONSTRAINT "project_tags_workspace_tag_foreign_key" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "app"."tags"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_workspace_business_foreign_key" FOREIGN KEY ("workspace_id","business_id") REFERENCES "app"."businesses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_workspace_source_service_foreign_key" FOREIGN KEY ("workspace_id","source_service_id") REFERENCES "app"."services"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."service_responsibles" ADD CONSTRAINT "service_responsibles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."service_responsibles" ADD CONSTRAINT "service_responsibles_workspace_service_foreign_key" FOREIGN KEY ("workspace_id","service_id") REFERENCES "app"."services"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."service_responsibles" ADD CONSTRAINT "service_responsibles_workspace_member_foreign_key" FOREIGN KEY ("workspace_id","user_id") REFERENCES "app"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."service_tags" ADD CONSTRAINT "service_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."service_tags" ADD CONSTRAINT "service_tags_workspace_service_foreign_key" FOREIGN KEY ("workspace_id","service_id") REFERENCES "app"."services"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."service_tags" ADD CONSTRAINT "service_tags_workspace_tag_foreign_key" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "app"."tags"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."services" ADD CONSTRAINT "services_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_installments_workspace_project_number_index" ON "app"."project_installments" USING btree ("workspace_id","project_id","number");--> statement-breakpoint
CREATE INDEX "project_installments_workspace_due_status_index" ON "app"."project_installments" USING btree ("workspace_id","due_date","status_key");--> statement-breakpoint
CREATE INDEX "project_responsibles_workspace_project_order_index" ON "app"."project_responsibles" USING btree ("workspace_id","project_id","sort_order","user_id");--> statement-breakpoint
CREATE INDEX "project_responsibles_workspace_user_project_index" ON "app"."project_responsibles" USING btree ("workspace_id","user_id","project_id");--> statement-breakpoint
CREATE INDEX "project_services_workspace_project_order_index" ON "app"."project_services" USING btree ("workspace_id","project_id","sort_order","service_id");--> statement-breakpoint
CREATE INDEX "project_services_workspace_service_project_index" ON "app"."project_services" USING btree ("workspace_id","service_id","project_id");--> statement-breakpoint
CREATE INDEX "project_tags_workspace_project_order_index" ON "app"."project_tags" USING btree ("workspace_id","project_id","sort_order","tag_id");--> statement-breakpoint
CREATE INDEX "project_tags_workspace_tag_project_index" ON "app"."project_tags" USING btree ("workspace_id","tag_id","project_id");--> statement-breakpoint
CREATE INDEX "projects_workspace_updated_id_index" ON "app"."projects" USING btree ("workspace_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "projects_workspace_status_archived_index" ON "app"."projects" USING btree ("workspace_id","status_key","archived_at");--> statement-breakpoint
CREATE INDEX "projects_workspace_business_archived_index" ON "app"."projects" USING btree ("workspace_id","business_id","archived_at");--> statement-breakpoint
CREATE INDEX "projects_workspace_source_service_index" ON "app"."projects" USING btree ("workspace_id","source_service_id");--> statement-breakpoint
CREATE INDEX "projects_workspace_name_lower_index" ON "app"."projects" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "service_responsibles_workspace_service_order_index" ON "app"."service_responsibles" USING btree ("workspace_id","service_id","sort_order","user_id");--> statement-breakpoint
CREATE INDEX "service_responsibles_workspace_user_service_index" ON "app"."service_responsibles" USING btree ("workspace_id","user_id","service_id");--> statement-breakpoint
CREATE INDEX "service_tags_workspace_service_order_index" ON "app"."service_tags" USING btree ("workspace_id","service_id","sort_order","tag_id");--> statement-breakpoint
CREATE INDEX "service_tags_workspace_tag_service_index" ON "app"."service_tags" USING btree ("workspace_id","tag_id","service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "services_workspace_active_name_unique" ON "app"."services" USING btree ("workspace_id",lower("name")) WHERE "app"."services"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "services_workspace_updated_id_index" ON "app"."services" USING btree ("workspace_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "services_workspace_archived_name_index" ON "app"."services" USING btree ("workspace_id","archived_at",lower("name"));--> statement-breakpoint
CREATE INDEX "tags_workspace_archived_key_index" ON "app"."tags" USING btree ("workspace_id","archived_at","key");--> statement-breakpoint
CREATE INDEX "tags_workspace_label_lower_index" ON "app"."tags" USING btree ("workspace_id",lower("label"));