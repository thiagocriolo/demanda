ALTER TABLE "app"."projects" DROP CONSTRAINT "projects_workspace_business_foreign_key";
--> statement-breakpoint
ALTER TABLE "app"."tasks" DROP CONSTRAINT "tasks_workspace_business_foreign_key";
--> statement-breakpoint
DROP INDEX "app"."businesses_workspace_updated_id_index";--> statement-breakpoint
DROP INDEX "app"."businesses_workspace_stage_archived_index";--> statement-breakpoint
DROP INDEX "app"."businesses_workspace_category_archived_index";--> statement-breakpoint
DROP INDEX "app"."businesses_workspace_name_lower_index";--> statement-breakpoint
DROP INDEX "app"."contacts_workspace_linked_user_unique";--> statement-breakpoint
DROP INDEX "app"."contacts_workspace_status_archived_index";--> statement-breakpoint
DROP INDEX "app"."contacts_workspace_name_lower_index";--> statement-breakpoint
DROP INDEX "app"."contacts_workspace_updated_id_index";--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
UPDATE "app"."businesses" AS business
SET "owner_user_id" = workspace."owner_user_id"
FROM "app"."workspaces" AS workspace
WHERE workspace."id" = business."workspace_id";--> statement-breakpoint
UPDATE "app"."contacts" AS contact
SET "owner_user_id" = workspace."owner_user_id"
FROM "app"."workspaces" AS workspace
WHERE workspace."id" = contact."workspace_id";--> statement-breakpoint
ALTER TABLE "app"."businesses" ALTER COLUMN "owner_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."contacts" ALTER COLUMN "owner_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."business_responsibles" ADD CONSTRAINT "business_responsibles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."businesses" ADD CONSTRAINT "businesses_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "app"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "businesses_owner_updated_id_index" ON "app"."businesses" USING btree ("owner_user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "businesses_owner_stage_archived_index" ON "app"."businesses" USING btree ("owner_user_id","stage_key","archived_at");--> statement-breakpoint
CREATE INDEX "businesses_owner_category_archived_index" ON "app"."businesses" USING btree ("owner_user_id","category_key","archived_at");--> statement-breakpoint
CREATE INDEX "businesses_owner_name_lower_index" ON "app"."businesses" USING btree ("owner_user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_owner_linked_user_unique" ON "app"."contacts" USING btree ("owner_user_id","linked_user_id") WHERE "app"."contacts"."linked_user_id" is not null and "app"."contacts"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "contacts_owner_status_archived_index" ON "app"."contacts" USING btree ("owner_user_id","status","archived_at");--> statement-breakpoint
CREATE INDEX "contacts_owner_name_lower_index" ON "app"."contacts" USING btree ("owner_user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "contacts_owner_updated_id_index" ON "app"."contacts" USING btree ("owner_user_id","updated_at","id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."enforce_private_business_responsible_owner"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  business_owner uuid;
  contact_owner uuid;
BEGIN
  SELECT "owner_user_id" INTO business_owner
  FROM "app"."businesses"
  WHERE "id" = NEW."business_id";

  SELECT "owner_user_id" INTO contact_owner
  FROM "app"."contacts"
  WHERE "id" = NEW."contact_id";

  IF business_owner IS NULL OR contact_owner IS NULL OR business_owner <> contact_owner THEN
    RAISE EXCEPTION 'business responsible must belong to the same owner'
      USING ERRCODE = '23514',
            CONSTRAINT = 'business_responsibles_same_owner';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "business_responsibles_same_owner"
BEFORE INSERT OR UPDATE OF "business_id", "contact_id"
ON "app"."business_responsibles"
FOR EACH ROW
EXECUTE FUNCTION "app"."enforce_private_business_responsible_owner"();
