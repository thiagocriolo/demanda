CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(320) NOT NULL,
	"avatar_url" text,
	"email_verified_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "users_name_not_blank" CHECK (length(btrim("app"."users"."name")) > 0),
	CONSTRAINT "users_email_normalized" CHECK ("app"."users"."email" = lower(btrim("app"."users"."email"))),
	CONSTRAINT "users_email_has_at_sign" CHECK (position('@' in "app"."users"."email") > 1)
);
--> statement-breakpoint
CREATE TABLE "app"."workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_user_primary_key" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "workspace_members_role_allowed" CHECK ("app"."workspace_members"."role" in ('owner', 'admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE "app"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"description" varchar(240) DEFAULT '' NOT NULL,
	"icon" varchar(80) DEFAULT 'briefcase-business' NOT NULL,
	"color" varchar(32) DEFAULT 'blue' NOT NULL,
	"kind" varchar(16) DEFAULT 'shared' NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "workspaces_name_not_blank" CHECK (length(btrim("app"."workspaces"."name")) > 0),
	CONSTRAINT "workspaces_kind_allowed" CHECK ("app"."workspaces"."kind" in ('personal', 'shared')),
	CONSTRAINT "workspaces_personal_not_archived" CHECK ("app"."workspaces"."kind" <> 'personal' or "app"."workspaces"."archived_at" is null)
);
--> statement-breakpoint
ALTER TABLE "app"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "app"."users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_index" ON "app"."workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_one_owner_unique" ON "app"."workspace_members" USING btree ("workspace_id") WHERE "app"."workspace_members"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "workspaces_owner_user_id_index" ON "app"."workspaces" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_personal_owner_unique" ON "app"."workspaces" USING btree ("owner_user_id") WHERE "app"."workspaces"."kind" = 'personal';