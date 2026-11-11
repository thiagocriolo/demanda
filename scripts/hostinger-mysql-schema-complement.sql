-- Complemento das migrations 0001 a 0007 para um banco que já recebeu a migration 0000.
-- Execute uma única vez no phpMyAdmin, selecionando o banco demanda2.

ALTER TABLE `projects` DROP INDEX `projects_workspace_business_institutional_unique`;
ALTER TABLE `projects` ADD `institutional_business_id` char(36) GENERATED ALWAYS AS (case when is_institutional then business_id else null end) VIRTUAL;
ALTER TABLE `projects` ADD CONSTRAINT `projects_workspace_business_institutional_unique` UNIQUE(`workspace_id`,`institutional_business_id`);

ALTER TABLE `workspace_members` DROP INDEX `workspace_members_one_owner_unique`;
ALTER TABLE `workspace_members` ADD `owner_user_id` char(36) GENERATED ALWAYS AS (case when role = 'owner' then user_id else null end) VIRTUAL;
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_one_owner_unique` UNIQUE(`workspace_id`,`owner_user_id`);

ALTER TABLE `projects` DROP FOREIGN KEY `projects_business_id_businesses_id_fk`;
ALTER TABLE `projects` ADD CONSTRAINT `projects_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `workspace_invitations` DROP INDEX `workspace_invitations_pending_email_unique`;
ALTER TABLE `workspaces` DROP INDEX `workspaces_personal_owner_unique`;
ALTER TABLE `contact_emails` DROP INDEX `contact_emails_one_primary_unique`;
ALTER TABLE `contact_phones` DROP INDEX `contact_phones_one_primary_unique`;
ALTER TABLE `delivery_templates` DROP INDEX `delivery_templates_workspace_active_name_unique`;
ALTER TABLE `services` DROP INDEX `services_workspace_active_name_unique`;
ALTER TABLE `workspace_invitations` ADD `pending_email` varchar(320) GENERATED ALWAYS AS (case when status = 'pending' then email else null end) VIRTUAL;
ALTER TABLE `workspaces` ADD `personal_owner_id` char(36) GENERATED ALWAYS AS (case when kind = 'personal' then owner_user_id else null end) VIRTUAL;
ALTER TABLE `contact_emails` ADD `primary_contact_id` char(36) GENERATED ALWAYS AS (case when is_primary then contact_id else null end) VIRTUAL;
ALTER TABLE `contact_phones` ADD `primary_contact_id` char(36) GENERATED ALWAYS AS (case when is_primary then contact_id else null end) VIRTUAL;
ALTER TABLE `delivery_templates` ADD `active_name` varchar(140) GENERATED ALWAYS AS (case when archived_at is null then name else null end) VIRTUAL;
ALTER TABLE `services` ADD `active_name` varchar(140) GENERATED ALWAYS AS (case when archived_at is null then name else null end) VIRTUAL;
ALTER TABLE `workspace_invitations` ADD CONSTRAINT `workspace_invitations_pending_email_unique` UNIQUE(`workspace_id`,`pending_email`);
ALTER TABLE `workspaces` ADD CONSTRAINT `workspaces_personal_owner_unique` UNIQUE(`personal_owner_id`);
ALTER TABLE `contact_emails` ADD CONSTRAINT `contact_emails_one_primary_unique` UNIQUE(`workspace_id`,`primary_contact_id`);
ALTER TABLE `contact_phones` ADD CONSTRAINT `contact_phones_one_primary_unique` UNIQUE(`workspace_id`,`primary_contact_id`);
ALTER TABLE `delivery_templates` ADD CONSTRAINT `delivery_templates_workspace_active_name_unique` UNIQUE(`workspace_id`,`active_name`);
ALTER TABLE `services` ADD CONSTRAINT `services_workspace_active_name_unique` UNIQUE(`workspace_id`,`active_name`);

ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_start_half_hour` CHECK (`start_minutes` BETWEEN 0 AND 1410 AND `start_minutes` % 30 = 0);
ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_duration_range` CHECK (`duration_minutes` BETWEEN 30 AND 480);
ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_duration_half_hour` CHECK (`duration_minutes` % 30 = 0);
ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_end_within_day` CHECK (`start_minutes` + `duration_minutes` <= 1440);

CREATE INDEX `contacts_name_search_index` ON `contacts` (`name`);
CREATE INDEX `contacts_owner_status_archived_index` ON `contacts` (`owner_user_id`, `status`, `archived_at`);
