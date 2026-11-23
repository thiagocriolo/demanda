-- MySQL retains foreign-key names when tables and columns are renamed.  Rebuild
-- affected keys so error translation and database metadata use the new terms.
ALTER TABLE `deliveries`
  DROP FOREIGN KEY `tasks_workspace_id_workspaces_id_fk`,
  DROP FOREIGN KEY `tasks_workspace_project_business_foreign_key`,
  DROP FOREIGN KEY `tasks_workspace_project_routine_foreign_key`,
  ADD CONSTRAINT `deliveries_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `deliveries_workspace_project_business_foreign_key` FOREIGN KEY (`workspace_id`, `project_id`, `business_id`) REFERENCES `projects` (`workspace_id`, `id`, `business_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `deliveries_workspace_project_routine_foreign_key` FOREIGN KEY (`workspace_id`, `project_routine_id`) REFERENCES `project_delivery_routines` (`workspace_id`, `id`) ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE `delivery_tasks`
  DROP FOREIGN KEY `task_subtasks_workspace_id_workspaces_id_fk`,
  DROP FOREIGN KEY `task_subtasks_workspace_task_foreign_key`,
  ADD CONSTRAINT `delivery_tasks_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `delivery_tasks_workspace_delivery_foreign_key` FOREIGN KEY (`workspace_id`, `delivery_id`) REFERENCES `deliveries` (`workspace_id`, `id`) ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE `delivery_responsibles`
  DROP FOREIGN KEY `task_responsibles_workspace_id_workspaces_id_fk`,
  DROP FOREIGN KEY `task_responsibles_workspace_task_foreign_key`,
  DROP FOREIGN KEY `task_responsibles_workspace_member_foreign_key`,
  ADD CONSTRAINT `delivery_responsibles_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `delivery_responsibles_workspace_delivery_foreign_key` FOREIGN KEY (`workspace_id`, `delivery_id`) REFERENCES `deliveries` (`workspace_id`, `id`) ON DELETE CASCADE,
  ADD CONSTRAINT `delivery_responsibles_workspace_member_foreign_key` FOREIGN KEY (`workspace_id`, `user_id`) REFERENCES `workspace_members` (`workspace_id`, `user_id`) ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE `delivery_tags`
  DROP FOREIGN KEY `task_tags_workspace_id_workspaces_id_fk`,
  DROP FOREIGN KEY `task_tags_workspace_task_foreign_key`,
  DROP FOREIGN KEY `task_tags_workspace_tag_foreign_key`,
  ADD CONSTRAINT `delivery_tags_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `delivery_tags_workspace_delivery_foreign_key` FOREIGN KEY (`workspace_id`, `delivery_id`) REFERENCES `deliveries` (`workspace_id`, `id`) ON DELETE CASCADE,
  ADD CONSTRAINT `delivery_tags_workspace_tag_foreign_key` FOREIGN KEY (`workspace_id`, `tag_id`) REFERENCES `tags` (`workspace_id`, `id`);--> statement-breakpoint

ALTER TABLE `delivery_comments`
  DROP FOREIGN KEY `task_comments_author_user_id_users_id_fk`,
  DROP FOREIGN KEY `task_comments_workspace_task_foreign_key`,
  ADD CONSTRAINT `delivery_comments_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `delivery_comments_workspace_delivery_foreign_key` FOREIGN KEY (`workspace_id`, `delivery_id`) REFERENCES `deliveries` (`workspace_id`, `id`) ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE `tool_uses`
  DROP FOREIGN KEY `tool_uses_workspace_task_foreign_key`,
  ADD CONSTRAINT `tool_uses_workspace_delivery_foreign_key` FOREIGN KEY (`workspace_id`, `delivery_id`) REFERENCES `deliveries` (`workspace_id`, `id`) ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE `agenda_entries`
  DROP FOREIGN KEY `agenda_entries_workspace_task_foreign_key`,
  ADD CONSTRAINT `agenda_entries_workspace_delivery_foreign_key` FOREIGN KEY (`workspace_id`, `delivery_id`) REFERENCES `deliveries` (`workspace_id`, `id`) ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE `cronograma_blocks`
  DROP FOREIGN KEY `cronograma_blocks_workspace_task_foreign_key`,
  DROP FOREIGN KEY `cronograma_blocks_workspace_subtask_foreign_key`;--> statement-breakpoint

ALTER TABLE `cronograma_blocks`
  ADD CONSTRAINT `cronograma_blocks_workspace_delivery_foreign_key` FOREIGN KEY (`workspace_id`, `delivery_id`) REFERENCES `deliveries` (`workspace_id`, `id`) ON DELETE CASCADE,
  ADD CONSTRAINT `cronograma_blocks_workspace_task_foreign_key` FOREIGN KEY (`workspace_id`, `task_id`, `delivery_id`) REFERENCES `delivery_tasks` (`workspace_id`, `id`, `delivery_id`) ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE `project_delivery_routines`
  DROP FOREIGN KEY `project_task_routines_workspace_project_foreign_key`,
  DROP FOREIGN KEY `project_task_routines_workspace_member_foreign_key`,
  ADD CONSTRAINT `project_delivery_routines_workspace_project_foreign_key` FOREIGN KEY (`workspace_id`, `project_id`) REFERENCES `projects` (`workspace_id`, `id`) ON DELETE CASCADE,
  ADD CONSTRAINT `project_delivery_routines_workspace_member_foreign_key` FOREIGN KEY (`workspace_id`, `responsible_user_id`) REFERENCES `workspace_members` (`workspace_id`, `user_id`);--> statement-breakpoint

ALTER TABLE `service_delivery_templates`
  DROP FOREIGN KEY `service_task_templates_workspace_id_workspaces_id_fk`,
  DROP FOREIGN KEY `service_task_templates_workspace_service_foreign_key`,
  DROP FOREIGN KEY `service_task_templates_workspace_template_foreign_key`,
  ADD CONSTRAINT `service_delivery_templates_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `service_delivery_templates_workspace_service_foreign_key` FOREIGN KEY (`workspace_id`, `service_id`) REFERENCES `services` (`workspace_id`, `id`) ON DELETE CASCADE,
  ADD CONSTRAINT `service_delivery_templates_workspace_template_foreign_key` FOREIGN KEY (`workspace_id`, `delivery_template_id`) REFERENCES `delivery_templates` (`workspace_id`, `id`) ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE `delivery_template_tasks`
  DROP FOREIGN KEY `delivery_template_subtasks_workspace_id_workspaces_id_fk`,
  DROP FOREIGN KEY `delivery_template_subtasks_workspace_template_foreign_key`,
  ADD CONSTRAINT `delivery_template_tasks_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `delivery_template_tasks_workspace_template_foreign_key` FOREIGN KEY (`workspace_id`, `delivery_template_id`) REFERENCES `delivery_templates` (`workspace_id`, `id`) ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE `personal_deliveries`
  DROP FOREIGN KEY `personal_tasks_user_id_users_id_fk`,
  ADD CONSTRAINT `personal_deliveries_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
