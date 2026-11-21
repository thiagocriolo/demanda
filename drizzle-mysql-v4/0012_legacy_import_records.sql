CREATE TABLE `legacy_import_records` (
	`workspace_id` char(36) NOT NULL,
	`source_key` varchar(96) NOT NULL,
	`source_record_id` varchar(160) NOT NULL,
	`imported_task_id` char(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `legacy_import_records_workspace_source_record_primary` PRIMARY KEY(`workspace_id`,`source_key`,`source_record_id`),
	CONSTRAINT `legacy_import_records_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `legacy_import_records_imported_task_id_tasks_id_fk` FOREIGN KEY (`imported_task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
);
