DROP TRIGGER IF EXISTS "contacts_guard_linked_workspace_member"
ON "app"."contacts";--> statement-breakpoint
DROP FUNCTION IF EXISTS "app"."guard_contact_linked_workspace_member"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_members_unlink_contacts_on_delete"
ON "app"."workspace_members";--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_members_unlink_contacts_on_identity_update"
ON "app"."workspace_members";--> statement-breakpoint
DROP FUNCTION IF EXISTS "app"."unlink_contacts_from_workspace_member"();
