CREATE TABLE "app"."user_storage_usage" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"storage_reserved_bytes" bigint DEFAULT 0 NOT NULL,
	"storage_limit_bytes" bigint,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_storage_usage_used_non_negative" CHECK ("app"."user_storage_usage"."storage_used_bytes" >= 0),
	CONSTRAINT "user_storage_usage_reserved_non_negative" CHECK ("app"."user_storage_usage"."storage_reserved_bytes" >= 0),
	CONSTRAINT "user_storage_usage_limit_positive" CHECK ("app"."user_storage_usage"."storage_limit_bytes" is null or "app"."user_storage_usage"."storage_limit_bytes" > 0),
	CONSTRAINT "user_storage_usage_within_limit" CHECK ("app"."user_storage_usage"."storage_limit_bytes" is null or "app"."user_storage_usage"."storage_used_bytes" + "app"."user_storage_usage"."storage_reserved_bytes" <= "app"."user_storage_usage"."storage_limit_bytes")
);
--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD COLUMN "status" varchar(16) DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD COLUMN "legacy_storage_key" varchar(512);--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD COLUMN "original_mime_type" varchar(120);--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD COLUMN "original_byte_size" integer;--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD COLUMN "original_width" integer;--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD COLUMN "original_height" integer;--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD COLUMN "updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."user_storage_usage" ADD CONSTRAINT "user_storage_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stored_files_status_updated_index" ON "app"."stored_files" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD CONSTRAINT "stored_files_status_allowed" CHECK ("app"."stored_files"."status" in ('pending', 'processing', 'ready', 'failed', 'deleting'));--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD CONSTRAINT "stored_files_original_byte_size_positive" CHECK ("app"."stored_files"."original_byte_size" is null or "app"."stored_files"."original_byte_size" > 0);
--> statement-breakpoint
UPDATE "app"."stored_files"
SET "original_mime_type" = "mime_type",
    "original_byte_size" = "byte_size",
    "original_width" = "width",
    "original_height" = "height",
    "updated_at" = now()
WHERE "original_byte_size" IS NULL;
--> statement-breakpoint
INSERT INTO "app"."user_storage_usage" (
  "user_id",
  "storage_used_bytes",
  "storage_reserved_bytes",
  "updated_at"
)
SELECT
  "users"."id",
  COALESCE(SUM("stored_files"."byte_size") FILTER (
    WHERE "stored_files"."deleted_at" IS NULL
  ), 0),
  0,
  now()
FROM "app"."users"
LEFT JOIN "app"."stored_files"
  ON "stored_files"."owner_user_id" = "users"."id"
GROUP BY "users"."id"
ON CONFLICT ("user_id") DO UPDATE
SET "storage_used_bytes" = EXCLUDED."storage_used_bytes",
    "storage_reserved_bytes" = 0,
    "updated_at" = now();
