ALTER TABLE `projects` DROP FOREIGN KEY `projects_business_id_businesses_id_fk`;
--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;