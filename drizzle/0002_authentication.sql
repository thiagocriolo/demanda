CREATE TABLE "app"."auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"remembered" boolean DEFAULT false NOT NULL,
	"user_agent" varchar(512),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	CONSTRAINT "auth_sessions_token_hash_hex" CHECK ("app"."auth_sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_sessions_expiration_after_creation" CHECK ("app"."auth_sessions"."expires_at" > "app"."auth_sessions"."created_at"),
	CONSTRAINT "auth_sessions_last_seen_not_before_creation" CHECK ("app"."auth_sessions"."last_seen_at" >= "app"."auth_sessions"."created_at"),
	CONSTRAINT "auth_sessions_revocation_not_before_creation" CHECK ("app"."auth_sessions"."revoked_at" is null or "app"."auth_sessions"."revoked_at" >= "app"."auth_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"used_at" timestamp (3) with time zone,
	CONSTRAINT "password_reset_tokens_token_hash_hex" CHECK ("app"."password_reset_tokens"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "password_reset_tokens_expiration_after_creation" CHECK ("app"."password_reset_tokens"."expires_at" > "app"."password_reset_tokens"."created_at"),
	CONSTRAINT "password_reset_tokens_usage_not_before_creation" CHECK ("app"."password_reset_tokens"."used_at" is null or "app"."password_reset_tokens"."used_at" >= "app"."password_reset_tokens"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."user_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"password_changed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_credentials_password_hash_not_blank" CHECK (length(btrim("app"."user_credentials"."password_hash")) > 0),
	CONSTRAINT "user_credentials_password_changed_not_before_creation" CHECK ("app"."user_credentials"."password_changed_at" >= "app"."user_credentials"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."users" ADD COLUMN "username" varchar(40);--> statement-breakpoint
UPDATE "app"."users"
SET "username" = 'user_' || replace("id"::text, '-', '')
WHERE "username" IS NULL;--> statement-breakpoint
ALTER TABLE "app"."users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "app"."auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_index" ON "app"."auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_index" ON "app"."auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_unique" ON "app"."password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_index" ON "app"."password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expires_at_index" ON "app"."password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_unique" ON "app"."users" USING btree (lower("username"));--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_username_normalized" CHECK ("app"."users"."username" = lower(btrim("app"."users"."username")));--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_username_format" CHECK ("app"."users"."username" ~ '^[a-z0-9._-]{3,40}$');
