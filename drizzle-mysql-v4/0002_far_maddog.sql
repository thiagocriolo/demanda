ALTER TABLE `workspace_members` DROP INDEX `workspace_members_one_owner_unique`;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD `owner_user_id` char(36) GENERATED ALWAYS AS (case when role = 'owner' then user_id else null end) VIRTUAL;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_one_owner_unique` UNIQUE(`workspace_id`,`owner_user_id`);