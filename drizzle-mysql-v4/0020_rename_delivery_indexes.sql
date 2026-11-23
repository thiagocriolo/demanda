-- Table and column renames retain MySQL index names.  Rename them too so the
-- physical schema uses the same Delivery -> Task vocabulary as the code.
ALTER TABLE `deliveries`
  RENAME INDEX `tasks_workspace_id_id_unique` TO `deliveries_workspace_id_id_unique`,
  RENAME INDEX `tasks_workspace_routine_occurrence_unique` TO `deliveries_workspace_routine_occurrence_unique`,
  RENAME INDEX `tasks_workspace_project_business_foreign_key` TO `deliveries_workspace_project_business_foreign_key`,
  RENAME INDEX `tasks_workspace_updated_id_index` TO `deliveries_workspace_updated_id_index`,
  RENAME INDEX `tasks_workspace_project_archived_order_index` TO `deliveries_workspace_project_archived_order_index`,
  RENAME INDEX `tasks_workspace_business_archived_order_index` TO `deliveries_workspace_business_archived_order_index`,
  RENAME INDEX `tasks_workspace_status_archived_order_index` TO `deliveries_workspace_status_archived_order_index`,
  RENAME INDEX `tasks_workspace_priority_archived_order_index` TO `deliveries_workspace_priority_archived_order_index`,
  RENAME INDEX `tasks_workspace_due_completion_archive_index` TO `deliveries_workspace_due_completion_archive_index`,
  RENAME INDEX `tasks_workspace_name_lower_index` TO `deliveries_workspace_name_lower_index`,
  RENAME INDEX `tasks_name_search_index` TO `deliveries_name_search_index`;--> statement-breakpoint

ALTER TABLE `delivery_tasks`
  RENAME INDEX `task_subtasks_workspace_id_id_unique` TO `delivery_tasks_workspace_id_id_unique`,
  RENAME INDEX `task_subtasks_workspace_id_task_unique` TO `delivery_tasks_workspace_id_delivery_unique`,
  RENAME INDEX `task_subtasks_workspace_task_archived_order_index` TO `delivery_tasks_workspace_delivery_archived_order_index`,
  RENAME INDEX `task_subtasks_workspace_status_completion_index` TO `delivery_tasks_workspace_status_completion_index`;--> statement-breakpoint

ALTER TABLE `delivery_responsibles`
  RENAME INDEX `task_responsibles_workspace_task_unique` TO `delivery_responsibles_workspace_delivery_unique`,
  RENAME INDEX `task_responsibles_workspace_task_order_index` TO `delivery_responsibles_workspace_delivery_order_index`,
  RENAME INDEX `task_responsibles_workspace_user_task_index` TO `delivery_responsibles_workspace_user_delivery_index`;--> statement-breakpoint

ALTER TABLE `delivery_tags`
  RENAME INDEX `task_tags_workspace_task_order_index` TO `delivery_tags_workspace_delivery_order_index`,
  RENAME INDEX `task_tags_workspace_tag_task_index` TO `delivery_tags_workspace_tag_delivery_index`;
