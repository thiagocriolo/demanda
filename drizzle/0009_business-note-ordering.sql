ALTER TABLE "app"."business_notes" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH "ordered_business_notes" AS (
	SELECT
		"id",
		(
			row_number() OVER (
				PARTITION BY "workspace_id", "business_id"
				ORDER BY "created_at", "id"
			) - 1
		)::integer AS "sort_order"
	FROM "app"."business_notes"
)
UPDATE "app"."business_notes" AS "note"
SET "sort_order" = "ordered_business_notes"."sort_order"
FROM "ordered_business_notes"
WHERE "note"."id" = "ordered_business_notes"."id";--> statement-breakpoint
CREATE INDEX "business_notes_workspace_business_order_index" ON "app"."business_notes" USING btree ("workspace_id","business_id","archived_at","sort_order","id");--> statement-breakpoint
ALTER TABLE "app"."business_notes" ADD CONSTRAINT "business_notes_sort_order_non_negative" CHECK ("app"."business_notes"."sort_order" >= 0);
