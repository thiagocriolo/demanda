ALTER TABLE `workspace_invitations` DROP INDEX `workspace_invitations_pending_email_unique`;--> statement-breakpoint
ALTER TABLE `workspaces` DROP INDEX `workspaces_personal_owner_unique`;--> statement-breakpoint
ALTER TABLE `contact_emails` DROP INDEX `contact_emails_one_primary_unique`;--> statement-breakpoint
ALTER TABLE `contact_phones` DROP INDEX `contact_phones_one_primary_unique`;--> statement-breakpoint
ALTER TABLE `delivery_templates` DROP INDEX `delivery_templates_workspace_active_name_unique`;--> statement-breakpoint
ALTER TABLE `services` DROP INDEX `services_workspace_active_name_unique`;--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD `pending_email` varchar(320) GENERATED ALWAYS AS (case when status = 'pending' then email else null end) VIRTUAL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `personal_owner_id` char(36) GENERATED ALWAYS AS (case when kind = 'personal' then owner_user_id else null end) VIRTUAL;--> statement-breakpoint
ALTER TABLE `contact_emails` ADD `primary_contact_id` char(36) GENERATED ALWAYS AS (case when is_primary then contact_id else null end) VIRTUAL;--> statement-breakpoint
ALTER TABLE `contact_phones` ADD `primary_contact_id` char(36) GENERATED ALWAYS AS (case when is_primary then contact_id else null end) VIRTUAL;--> statement-breakpoint
ALTER TABLE `delivery_templates` ADD `active_name` varchar(140) GENERATED ALWAYS AS (case when archived_at is null then name else null end) VIRTUAL;--> statement-breakpoint
ALTER TABLE `services` ADD `active_name` varchar(140) GENERATED ALWAYS AS (case when archived_at is null then name else null end) VIRTUAL;--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD CONSTRAINT `workspace_invitations_pending_email_unique` UNIQUE(`workspace_id`,`pending_email`);--> statement-breakpoint
ALTER TABLE `workspaces` ADD CONSTRAINT `workspaces_personal_owner_unique` UNIQUE(`personal_owner_id`);--> statement-breakpoint
ALTER TABLE `contact_emails` ADD CONSTRAINT `contact_emails_one_primary_unique` UNIQUE(`workspace_id`,`primary_contact_id`);--> statement-breakpoint
ALTER TABLE `contact_phones` ADD CONSTRAINT `contact_phones_one_primary_unique` UNIQUE(`workspace_id`,`primary_contact_id`);--> statement-breakpoint
ALTER TABLE `delivery_templates` ADD CONSTRAINT `delivery_templates_workspace_active_name_unique` UNIQUE(`workspace_id`,`active_name`);--> statement-breakpoint
ALTER TABLE `services` ADD CONSTRAINT `services_workspace_active_name_unique` UNIQUE(`workspace_id`,`active_name`);