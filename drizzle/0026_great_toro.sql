DROP INDEX "app"."business_responsibles_workspace_business_order_index";--> statement-breakpoint
ALTER TABLE "app"."business_responsibles" DROP CONSTRAINT "business_responsibles_workspace_business_contact_primary_key";--> statement-breakpoint
ALTER TABLE "app"."business_responsibles" ALTER COLUMN "contact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."business_responsibles" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."business_responsibles" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."business_responsibles" ADD CONSTRAINT "business_responsibles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_responsibles_user_index" ON "app"."business_responsibles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_responsibles_business_contact_unique" ON "app"."business_responsibles" USING btree ("workspace_id","business_id","contact_id") WHERE "app"."business_responsibles"."contact_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "business_responsibles_business_user_unique" ON "app"."business_responsibles" USING btree ("workspace_id","business_id","user_id") WHERE "app"."business_responsibles"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "business_responsibles_workspace_business_order_index" ON "app"."business_responsibles" USING btree ("workspace_id","business_id","sort_order","id");--> statement-breakpoint
ALTER TABLE "app"."business_responsibles" ADD CONSTRAINT "business_responsibles_exactly_one_subject" CHECK (num_nonnulls("app"."business_responsibles"."contact_id", "app"."business_responsibles"."user_id") = 1);--> statement-breakpoint
DROP TRIGGER "business_responsibles_same_owner" ON "app"."business_responsibles";--> statement-breakpoint
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

  IF NEW."contact_id" IS NOT NULL THEN
    SELECT "owner_user_id" INTO contact_owner
    FROM "app"."contacts"
    WHERE "id" = NEW."contact_id";

    IF business_owner IS NULL OR contact_owner IS NULL OR business_owner <> contact_owner THEN
      RAISE EXCEPTION 'business responsible contact must belong to the same owner'
        USING ERRCODE = '23514',
              CONSTRAINT = 'business_responsibles_same_owner';
    END IF;
  ELSIF NEW."user_id" IS NOT NULL THEN
    IF business_owner IS NULL OR (
      NEW."user_id" <> business_owner
      AND NOT EXISTS (
        SELECT 1
        FROM "app"."user_connections" connection
        WHERE (
          connection."user_a_id" = business_owner
          AND connection."user_b_id" = NEW."user_id"
        ) OR (
          connection."user_b_id" = business_owner
          AND connection."user_a_id" = NEW."user_id"
        )
      )
    ) THEN
      RAISE EXCEPTION 'business responsible user must belong to the owner contact cycle'
        USING ERRCODE = '23514',
              CONSTRAINT = 'business_responsibles_same_owner';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "business_responsibles_same_owner"
BEFORE INSERT OR UPDATE OF "business_id", "contact_id", "user_id"
ON "app"."business_responsibles"
FOR EACH ROW
EXECUTE FUNCTION "app"."enforce_private_business_responsible_owner"();
