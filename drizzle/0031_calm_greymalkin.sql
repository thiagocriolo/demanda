ALTER TABLE "app"."communities" ADD COLUMN "link_name" varchar(40);--> statement-breakpoint
UPDATE "app"."communities"
SET "link_name" = 'comunidade-' || left(replace("id"::text, '-', ''), 12)
WHERE "link_name" IS NULL;--> statement-breakpoint
ALTER TABLE "app"."communities" ALTER COLUMN "link_name" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "communities_link_name_unique" ON "app"."communities" USING btree ("link_name");--> statement-breakpoint
ALTER TABLE "app"."communities" ADD CONSTRAINT "communities_link_name_normalized" CHECK ("app"."communities"."link_name" = lower(btrim("app"."communities"."link_name")));--> statement-breakpoint
ALTER TABLE "app"."communities" ADD CONSTRAINT "communities_link_name_format" CHECK ("app"."communities"."link_name" ~ '^[a-z0-9._-]{3,40}$');
