CREATE TABLE "app"."stored_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"backend" varchar(16) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"extension" varchar(16) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" char(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "stored_files_purpose_allowed" CHECK ("app"."stored_files"."purpose" in ('profile_avatar', 'attachment')),
	CONSTRAINT "stored_files_backend_allowed" CHECK ("app"."stored_files"."backend" in ('local', 's3')),
	CONSTRAINT "stored_files_original_name_not_blank" CHECK (length(btrim("app"."stored_files"."original_name")) > 0),
	CONSTRAINT "stored_files_extension_normalized" CHECK ("app"."stored_files"."extension" ~ '^\.[a-z0-9]{1,15}$'),
	CONSTRAINT "stored_files_mime_type_not_blank" CHECK (length(btrim("app"."stored_files"."mime_type")) > 0),
	CONSTRAINT "stored_files_byte_size_positive" CHECK ("app"."stored_files"."byte_size" > 0),
	CONSTRAINT "stored_files_dimensions_complete" CHECK (("app"."stored_files"."width" is null and "app"."stored_files"."height" is null) or ("app"."stored_files"."width" > 0 and "app"."stored_files"."height" > 0)),
	CONSTRAINT "stored_files_sha256_hex" CHECK ("app"."stored_files"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "stored_files_deletion_not_before_creation" CHECK ("app"."stored_files"."deleted_at" is null or "app"."stored_files"."deleted_at" >= "app"."stored_files"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD CONSTRAINT "stored_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."stored_files" ADD CONSTRAINT "stored_files_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stored_files_storage_key_unique" ON "app"."stored_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "stored_files_workspace_created_index" ON "app"."stored_files" USING btree ("workspace_id","deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "stored_files_owner_user_id_index" ON "app"."stored_files" USING btree ("owner_user_id");
--> statement-breakpoint
UPDATE "app"."user_preferences"
SET "settings" = jsonb_set("settings", '{profile,photo}', '""'::jsonb, true),
    "version" = "version" + 1,
    "updated_at" = now()
WHERE "settings" #>> '{profile,photo}' LIKE 'data:%';
--> statement-breakpoint
UPDATE "app"."users"
SET "avatar_url" = NULL,
    "updated_at" = now()
WHERE "avatar_url" LIKE 'data:%';
