CREATE TABLE `project_task_routines` (
  `id` char(36) NOT NULL,
  `workspace_id` char(36) NOT NULL,
  `project_id` char(36) NOT NULL,
  `source_service_task_template_id` char(36) NULL,
  `name` varchar(140) NOT NULL,
  `description` text NOT NULL,
  `category_key` varchar(64) NULL,
  `priority_key` varchar(64) NOT NULL,
  `status_key` varchar(64) NOT NULL,
  `responsible_user_id` char(36) NOT NULL,
  `tag_ids` text NOT NULL,
  `subtasks` text NOT NULL,
  `recurrence_type` varchar(16) NOT NULL,
  `recurrence_unit` varchar(16) NULL,
  `recurrence_days` text NOT NULL,
  `created_at` timestamp(3) NOT NULL,
  `updated_at` timestamp(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_task_routines_workspace_id_id_unique` (`workspace_id`,`id`),
  KEY `project_task_routines_workspace_project_index` (`workspace_id`,`project_id`),
  CONSTRAINT `project_task_routines_workspace_project_foreign_key` FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects` (`workspace_id`,`id`) ON DELETE CASCADE,
  CONSTRAINT `project_task_routines_workspace_member_foreign_key` FOREIGN KEY (`workspace_id`,`responsible_user_id`) REFERENCES `workspace_members` (`workspace_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `tasks`
  ADD COLUMN `project_routine_id` char(36) NULL,
  ADD COLUMN `routine_occurrence_date` date NULL,
  ADD CONSTRAINT `tasks_workspace_project_routine_foreign_key` FOREIGN KEY (`workspace_id`,`project_routine_id`) REFERENCES `project_task_routines` (`workspace_id`,`id`) ON DELETE SET NULL,
  ADD UNIQUE KEY `tasks_workspace_routine_occurrence_unique` (`workspace_id`,`project_routine_id`,`routine_occurrence_date`);
