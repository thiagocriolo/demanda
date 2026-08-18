CREATE TABLE "app"."contact_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"type" varchar(16) DEFAULT 'personal' NOT NULL,
	"address" varchar(320) NOT NULL,
	"label" varchar(80),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_emails_type_allowed" CHECK ("app"."contact_emails"."type" in ('personal', 'work', 'other')),
	CONSTRAINT "contact_emails_address_normalized" CHECK ("app"."contact_emails"."address" = lower(btrim("app"."contact_emails"."address"))),
	CONSTRAINT "contact_emails_address_format" CHECK ("app"."contact_emails"."address" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
	CONSTRAINT "contact_emails_label_not_blank" CHECK ("app"."contact_emails"."label" is null or length(btrim("app"."contact_emails"."label")) > 0),
	CONSTRAINT "contact_emails_updated_not_before_creation" CHECK ("app"."contact_emails"."updated_at" >= "app"."contact_emails"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."contact_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "contact_notes_body_not_blank" CHECK (length(btrim("app"."contact_notes"."body")) > 0),
	CONSTRAINT "contact_notes_updated_not_before_creation" CHECK ("app"."contact_notes"."updated_at" >= "app"."contact_notes"."created_at"),
	CONSTRAINT "contact_notes_archive_not_before_creation" CHECK ("app"."contact_notes"."archived_at" is null or "app"."contact_notes"."archived_at" >= "app"."contact_notes"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."contact_phones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"type" varchar(16) DEFAULT 'mobile' NOT NULL,
	"number" varchar(16) NOT NULL,
	"label" varchar(80),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_phones_type_allowed" CHECK ("app"."contact_phones"."type" in ('mobile', 'whatsapp', 'work', 'home', 'other')),
	CONSTRAINT "contact_phones_number_e164" CHECK ("app"."contact_phones"."number" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "contact_phones_label_not_blank" CHECK ("app"."contact_phones"."label" is null or length(btrim("app"."contact_phones"."label")) > 0),
	CONSTRAINT "contact_phones_updated_not_before_creation" CHECK ("app"."contact_phones"."updated_at" >= "app"."contact_phones"."created_at")
);
--> statement-breakpoint
CREATE TABLE "app"."contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"linked_user_id" uuid,
	"name" varchar(120) NOT NULL,
	"contact_type" varchar(16) DEFAULT 'person' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"profession" varchar(120),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	CONSTRAINT "contacts_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "contacts_name_not_blank" CHECK (length(btrim("app"."contacts"."name")) > 0),
	CONSTRAINT "contacts_type_allowed" CHECK ("app"."contacts"."contact_type" in ('person', 'company', 'other')),
	CONSTRAINT "contacts_status_allowed" CHECK ("app"."contacts"."status" in ('lead', 'prospect', 'active', 'inactive')),
	CONSTRAINT "contacts_profession_not_blank" CHECK ("app"."contacts"."profession" is null or length(btrim("app"."contacts"."profession")) > 0),
	CONSTRAINT "contacts_updated_not_before_creation" CHECK ("app"."contacts"."updated_at" >= "app"."contacts"."created_at"),
	CONSTRAINT "contacts_archive_not_before_creation" CHECK ("app"."contacts"."archived_at" is null or "app"."contacts"."archived_at" >= "app"."contacts"."created_at")
);
--> statement-breakpoint
ALTER TABLE "app"."contact_emails" ADD CONSTRAINT "contact_emails_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_emails" ADD CONSTRAINT "contact_emails_workspace_contact_foreign_key" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "app"."contacts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_notes" ADD CONSTRAINT "contact_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_notes" ADD CONSTRAINT "contact_notes_workspace_contact_foreign_key" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "app"."contacts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_phones" ADD CONSTRAINT "contact_phones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_phones" ADD CONSTRAINT "contact_phones_workspace_contact_foreign_key" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "app"."contacts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "app"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_emails_workspace_contact_address_unique" ON "app"."contact_emails" USING btree ("workspace_id","contact_id","address");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_emails_one_primary_unique" ON "app"."contact_emails" USING btree ("workspace_id","contact_id") WHERE "app"."contact_emails"."is_primary";--> statement-breakpoint
CREATE INDEX "contact_emails_workspace_address_index" ON "app"."contact_emails" USING btree ("workspace_id","address");--> statement-breakpoint
CREATE INDEX "contact_notes_workspace_contact_created_index" ON "app"."contact_notes" USING btree ("workspace_id","contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_phones_workspace_contact_number_unique" ON "app"."contact_phones" USING btree ("workspace_id","contact_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_phones_one_primary_unique" ON "app"."contact_phones" USING btree ("workspace_id","contact_id") WHERE "app"."contact_phones"."is_primary";--> statement-breakpoint
CREATE INDEX "contact_phones_workspace_number_index" ON "app"."contact_phones" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_workspace_linked_user_unique" ON "app"."contacts" USING btree ("workspace_id","linked_user_id") WHERE "app"."contacts"."linked_user_id" is not null;--> statement-breakpoint
CREATE INDEX "contacts_workspace_status_archived_index" ON "app"."contacts" USING btree ("workspace_id","status","archived_at");--> statement-breakpoint
CREATE INDEX "contacts_workspace_name_lower_index" ON "app"."contacts" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE FUNCTION "app"."guard_contact_linked_workspace_member"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	IF NEW.linked_user_id IS NULL THEN
		RETURN NEW;
	END IF;

	PERFORM 1
	FROM "app"."workspace_members"
	WHERE workspace_id = NEW.workspace_id
		AND user_id = NEW.linked_user_id
	FOR KEY SHARE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'O usuario vinculado ao contato deve pertencer ao mesmo workspace.'
			USING ERRCODE = '23503',
			CONSTRAINT = 'contacts_linked_workspace_member_foreign_key';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "contacts_guard_linked_workspace_member"
BEFORE INSERT OR UPDATE OF workspace_id, linked_user_id ON "app"."contacts"
FOR EACH ROW
EXECUTE FUNCTION "app"."guard_contact_linked_workspace_member"();--> statement-breakpoint
CREATE FUNCTION "app"."unlink_contacts_from_workspace_member"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
	UPDATE "app"."contacts"
	SET linked_user_id = NULL,
		updated_at = now()
	WHERE workspace_id = OLD.workspace_id
		AND linked_user_id = OLD.user_id;

	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "workspace_members_unlink_contacts_on_delete"
AFTER DELETE ON "app"."workspace_members"
FOR EACH ROW
EXECUTE FUNCTION "app"."unlink_contacts_from_workspace_member"();--> statement-breakpoint
CREATE TRIGGER "workspace_members_unlink_contacts_on_identity_update"
AFTER UPDATE OF workspace_id, user_id ON "app"."workspace_members"
FOR EACH ROW
WHEN (
	OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
	OR OLD.user_id IS DISTINCT FROM NEW.user_id
)
EXECUTE FUNCTION "app"."unlink_contacts_from_workspace_member"();
