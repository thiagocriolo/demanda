CREATE TABLE "app"."financial_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"project_installment_id" uuid,
	"source" varchar(16) NOT NULL,
	"type" varchar(16) NOT NULL,
	"mode" varchar(16) NOT NULL,
	"title" varchar(160) NOT NULL,
	"category" varchar(120) DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"competence_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"settled_at" timestamp (3) with time zone,
	"settled_by_user_id" uuid,
	"series_id" uuid,
	"series_kind" varchar(16),
	"series_number" integer,
	"series_count" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "financial_entries_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "financial_entries_workspace_project_installment_unique" UNIQUE("workspace_id","project_installment_id"),
	CONSTRAINT "financial_entries_source_allowed" CHECK ("app"."financial_entries"."source" in ('manual', 'project')),
	CONSTRAINT "financial_entries_source_consistent" CHECK (("app"."financial_entries"."source" = 'manual' and "app"."financial_entries"."project_id" is null and "app"."financial_entries"."project_installment_id" is null)
        or ("app"."financial_entries"."source" = 'project' and "app"."financial_entries"."project_id" is not null and "app"."financial_entries"."project_installment_id" is not null)),
	CONSTRAINT "financial_entries_type_allowed" CHECK ("app"."financial_entries"."type" in ('revenue', 'expense')),
	CONSTRAINT "financial_entries_mode_allowed" CHECK ("app"."financial_entries"."mode" in ('one_off', 'recurring')),
	CONSTRAINT "financial_entries_title_not_blank" CHECK (length(btrim("app"."financial_entries"."title")) > 0),
	CONSTRAINT "financial_entries_amount_positive" CHECK ("app"."financial_entries"."amount" > 0 and "app"."financial_entries"."amount" <= 9999999999999999.99),
	CONSTRAINT "financial_entries_status_allowed" CHECK ("app"."financial_entries"."status" in ('open', 'paused', 'settled')),
	CONSTRAINT "financial_entries_settlement_consistent" CHECK (("app"."financial_entries"."status" = 'settled') = ("app"."financial_entries"."settled_at" is not null)),
	CONSTRAINT "financial_entries_series_consistent" CHECK (("app"."financial_entries"."series_kind" is null and "app"."financial_entries"."series_id" is null and "app"."financial_entries"."series_number" is null and "app"."financial_entries"."series_count" is null)
        or ("app"."financial_entries"."series_kind" in ('installment', 'recurrence') and "app"."financial_entries"."series_id" is not null and "app"."financial_entries"."series_number" between 1 and 999 and "app"."financial_entries"."series_count" between 1 and 999 and "app"."financial_entries"."series_number" <= "app"."financial_entries"."series_count")),
	CONSTRAINT "financial_entries_version_positive" CHECK ("app"."financial_entries"."version" > 0),
	CONSTRAINT "financial_entries_updated_not_before_creation" CHECK ("app"."financial_entries"."updated_at" >= "app"."financial_entries"."created_at"),
	CONSTRAINT "financial_entries_deleted_not_before_creation" CHECK ("app"."financial_entries"."deleted_at" is null or "app"."financial_entries"."deleted_at" >= "app"."financial_entries"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."financial_entries" ADD CONSTRAINT "financial_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."financial_entries" ADD CONSTRAINT "financial_entries_settled_by_user_id_users_id_fk" FOREIGN KEY ("settled_by_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."financial_entries" ADD CONSTRAINT "financial_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."financial_entries" ADD CONSTRAINT "financial_entries_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."financial_entries" ADD CONSTRAINT "financial_entries_workspace_project_foreign_key" FOREIGN KEY ("workspace_id","project_id") REFERENCES "app"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."financial_entries" ADD CONSTRAINT "financial_entries_workspace_project_installment_foreign_key" FOREIGN KEY ("workspace_id","project_installment_id") REFERENCES "app"."project_installments"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_entries_workspace_due_status_index" ON "app"."financial_entries" USING btree ("workspace_id","due_date","status","deleted_at","id");--> statement-breakpoint
CREATE INDEX "financial_entries_workspace_competence_type_index" ON "app"."financial_entries" USING btree ("workspace_id","competence_date","type","deleted_at","id");--> statement-breakpoint
CREATE INDEX "financial_entries_workspace_series_index" ON "app"."financial_entries" USING btree ("workspace_id","series_id","series_number");--> statement-breakpoint
CREATE INDEX "financial_entries_workspace_project_index" ON "app"."financial_entries" USING btree ("workspace_id","project_id","deleted_at");