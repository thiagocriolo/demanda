ALTER TABLE "app"."projects" ADD COLUMN "is_institutional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO "app"."projects" (
  "workspace_id",
  "business_id",
  "is_institutional",
  "name",
  "status_key",
  "start_date",
  "created_at",
  "updated_at"
)
SELECT
  "workspace_id",
  "id",
  true,
  'Institucional',
  'execucao',
  "created_at"::date,
  "created_at",
  "updated_at"
FROM "app"."businesses";--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_business_institutional_unique" ON "app"."projects" USING btree ("workspace_id","business_id") WHERE "app"."projects"."is_institutional";--> statement-breakpoint
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_institutional_not_archived" CHECK (not "app"."projects"."is_institutional" or "app"."projects"."archived_at" is null);
