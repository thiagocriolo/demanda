CREATE TABLE "app"."business_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "business_notes_body_not_blank" CHECK (length(btrim("app"."business_notes"."body")) > 0),
	CONSTRAINT "business_notes_updated_not_before_creation" CHECK ("app"."business_notes"."updated_at" >= "app"."business_notes"."created_at"),
	CONSTRAINT "business_notes_archive_not_before_creation" CHECK ("app"."business_notes"."archived_at" is null or "app"."business_notes"."archived_at" >= "app"."business_notes"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."business_responsibles" (
	"workspace_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"sort_order" integer,
	CONSTRAINT "business_responsibles_workspace_business_contact_primary_key" PRIMARY KEY("workspace_id","business_id","contact_id"),
	CONSTRAINT "business_responsibles_sort_order_non_negative" CHECK ("app"."business_responsibles"."sort_order" is null or "app"."business_responsibles"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"category_key" varchar(64) NOT NULL,
	"stage_key" varchar(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "businesses_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "businesses_name_not_blank" CHECK (length(btrim("app"."businesses"."name")) > 0),
	CONSTRAINT "businesses_category_key_normalized" CHECK ("app"."businesses"."category_key" = lower(btrim("app"."businesses"."category_key"))),
	CONSTRAINT "businesses_category_key_format" CHECK ("app"."businesses"."category_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "businesses_stage_key_normalized" CHECK ("app"."businesses"."stage_key" = lower(btrim("app"."businesses"."stage_key"))),
	CONSTRAINT "businesses_stage_key_format" CHECK ("app"."businesses"."stage_key" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "businesses_updated_not_before_creation" CHECK ("app"."businesses"."updated_at" >= "app"."businesses"."created_at"),
	CONSTRAINT "businesses_archive_not_before_creation" CHECK ("app"."businesses"."archived_at" is null or "app"."businesses"."archived_at" >= "app"."businesses"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."business_notes" ADD CONSTRAINT "business_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_notes" ADD CONSTRAINT "business_notes_workspace_business_foreign_key" FOREIGN KEY ("workspace_id","business_id") REFERENCES "app"."businesses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_responsibles" ADD CONSTRAINT "business_responsibles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_responsibles" ADD CONSTRAINT "business_responsibles_workspace_business_foreign_key" FOREIGN KEY ("workspace_id","business_id") REFERENCES "app"."businesses"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_responsibles" ADD CONSTRAINT "business_responsibles_workspace_contact_foreign_key" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "app"."contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD CONSTRAINT "businesses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_notes_workspace_business_created_index" ON "app"."business_notes" USING btree ("workspace_id","business_id","created_at");--> statement-breakpoint
CREATE INDEX "business_responsibles_workspace_contact_index" ON "app"."business_responsibles" USING btree ("workspace_id","contact_id");--> statement-breakpoint
CREATE INDEX "business_responsibles_workspace_business_order_index" ON "app"."business_responsibles" USING btree ("workspace_id","business_id","sort_order","contact_id");--> statement-breakpoint
CREATE INDEX "businesses_workspace_updated_id_index" ON "app"."businesses" USING btree ("workspace_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "businesses_workspace_stage_archived_index" ON "app"."businesses" USING btree ("workspace_id","stage_key","archived_at");--> statement-breakpoint
CREATE INDEX "businesses_workspace_category_archived_index" ON "app"."businesses" USING btree ("workspace_id","category_key","archived_at");--> statement-breakpoint
CREATE INDEX "businesses_workspace_name_lower_index" ON "app"."businesses" USING btree ("workspace_id",lower("name"));