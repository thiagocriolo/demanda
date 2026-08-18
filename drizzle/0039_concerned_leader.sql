CREATE TABLE "app"."service_task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"delivery_template_id" uuid NOT NULL,
	"name" varchar(140) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_task_templates_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "service_task_templates_name_not_blank" CHECK (length(btrim("app"."service_task_templates"."name")) > 0),
	CONSTRAINT "service_task_templates_sort_order_non_negative" CHECK ("app"."service_task_templates"."sort_order" >= 0),
	CONSTRAINT "service_task_templates_updated_not_before_creation" CHECK ("app"."service_task_templates"."updated_at" >= "app"."service_task_templates"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."service_task_templates" ADD CONSTRAINT "service_task_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."service_task_templates" ADD CONSTRAINT "service_task_templates_workspace_service_foreign_key" FOREIGN KEY ("workspace_id","service_id") REFERENCES "app"."services"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."service_task_templates" ADD CONSTRAINT "service_task_templates_workspace_template_foreign_key" FOREIGN KEY ("workspace_id","delivery_template_id") REFERENCES "app"."delivery_templates"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_task_templates_workspace_service_order_index" ON "app"."service_task_templates" USING btree ("workspace_id","service_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "service_task_templates_workspace_template_index" ON "app"."service_task_templates" USING btree ("workspace_id","delivery_template_id");
--> statement-breakpoint
INSERT INTO "app"."service_task_templates" (
	"workspace_id",
	"service_id",
	"delivery_template_id",
	"name",
	"sort_order",
	"created_at",
	"updated_at"
)
SELECT
	delivery."workspace_id",
	delivery."service_id",
	delivery."id",
	delivery."name",
	(row_number() OVER (
		PARTITION BY delivery."workspace_id", delivery."service_id"
		ORDER BY delivery."sort_order", delivery."id"
	) - 1)::integer,
	delivery."created_at",
	delivery."updated_at"
FROM "app"."delivery_templates" delivery
INNER JOIN "app"."services" service
	ON service."workspace_id" = delivery."workspace_id"
	AND service."id" = delivery."service_id"
WHERE delivery."service_id" IS NOT NULL
	AND delivery."archived_at" IS NULL
	AND service."archived_at" IS NULL;
--> statement-breakpoint
UPDATE "app"."delivery_templates" SET "service_id" = NULL WHERE "service_id" IS NOT NULL;
