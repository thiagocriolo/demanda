CREATE TABLE `service_packages` (
	`id` char(36) NOT NULL,
	`owner_user_id` char(36) NOT NULL,
	`name` varchar(140) NOT NULL,
	`description` text NOT NULL,
	`icon` varchar(80) NOT NULL DEFAULT 'package',
	`color` varchar(32) NOT NULL DEFAULT 'blue',
	`amount_cents` bigint NOT NULL DEFAULT 0,
	`duration_months` int NULL,
	`installment_count` int NOT NULL DEFAULT 1,
	`payment_method` varchar(120) NULL,
	`payment_terms` text NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`archived_at` timestamp(3) NULL,
	CONSTRAINT `service_packages_id` PRIMARY KEY(`id`),
	INDEX `service_packages_owner_archived_updated_index` (`owner_user_id`,`archived_at`,`updated_at`,`id`),
	INDEX `service_packages_owner_order_index` (`owner_user_id`,`sort_order`,`id`),
	CONSTRAINT `service_packages_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE TABLE `service_package_projects` (
	`id` char(36) NOT NULL,
	`service_package_id` char(36) NOT NULL,
	`is_institutional` boolean NOT NULL DEFAULT false,
	`name` varchar(140) NOT NULL,
	`briefing` text NOT NULL,
	`project_type` varchar(16) NOT NULL DEFAULT 'one_off',
	`duration_days` int NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `service_package_projects_id` PRIMARY KEY(`id`),
	INDEX `service_package_projects_package_order_index` (`service_package_id`,`sort_order`,`id`),
	CONSTRAINT `service_package_projects_package_fk` FOREIGN KEY (`service_package_id`) REFERENCES `service_packages`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE TABLE `service_package_deliveries` (
	`id` char(36) NOT NULL,
	`service_package_id` char(36) NOT NULL,
	`service_project_id` char(36) NOT NULL,
	`name` varchar(140) NOT NULL,
	`description` text NOT NULL,
	`priority_key` varchar(64) NOT NULL DEFAULT 'normal',
	`recurrence_type` varchar(16) NOT NULL DEFAULT 'one_off',
	`recurrence_unit` varchar(16) NULL,
	`recurrence_days` text NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `service_package_deliveries_id` PRIMARY KEY(`id`),
	INDEX `service_package_deliveries_project_order_index` (`service_project_id`,`sort_order`,`id`),
	INDEX `service_package_deliveries_package_index` (`service_package_id`),
	CONSTRAINT `service_package_deliveries_package_fk` FOREIGN KEY (`service_package_id`) REFERENCES `service_packages`(`id`) ON DELETE CASCADE,
	CONSTRAINT `service_package_deliveries_project_fk` FOREIGN KEY (`service_project_id`) REFERENCES `service_package_projects`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE TABLE `service_package_tasks` (
	`id` char(36) NOT NULL,
	`service_package_id` char(36) NOT NULL,
	`service_delivery_id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`duration_minutes` int NOT NULL DEFAULT 60,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `service_package_tasks_id` PRIMARY KEY(`id`),
	INDEX `service_package_tasks_delivery_order_index` (`service_delivery_id`,`sort_order`,`id`),
	INDEX `service_package_tasks_package_index` (`service_package_id`),
	CONSTRAINT `service_package_tasks_package_fk` FOREIGN KEY (`service_package_id`) REFERENCES `service_packages`(`id`) ON DELETE CASCADE,
	CONSTRAINT `service_package_tasks_delivery_fk` FOREIGN KEY (`service_delivery_id`) REFERENCES `service_package_deliveries`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

ALTER TABLE `contracts`
	ADD COLUMN `source_service_package_id` char(36) NULL,
	ADD CONSTRAINT `contracts_source_service_package_fk` FOREIGN KEY (`source_service_package_id`) REFERENCES `service_packages`(`id`) ON DELETE SET NULL;
