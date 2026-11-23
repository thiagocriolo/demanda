-- The old hierarchy was Task -> Subtask.  The product hierarchy is now
-- Delivery -> Task.  IDs and rows are deliberately preserved.
SET FOREIGN_KEY_CHECKS = 0;--> statement-breakpoint

RENAME TABLE
  `tasks` TO `deliveries`,
  `task_subtasks` TO `delivery_tasks`,
  `task_responsibles` TO `delivery_responsibles`,
  `task_tags` TO `delivery_tags`,
  `task_comments` TO `delivery_comments`,
  `project_task_routines` TO `project_delivery_routines`,
  `service_task_templates` TO `service_delivery_templates`,
  `delivery_template_subtasks` TO `delivery_template_tasks`,
  `personal_tasks` TO `personal_deliveries`;--> statement-breakpoint

ALTER TABLE `delivery_tasks` RENAME COLUMN `task_id` TO `delivery_id`;--> statement-breakpoint
ALTER TABLE `delivery_responsibles` RENAME COLUMN `task_id` TO `delivery_id`;--> statement-breakpoint
ALTER TABLE `delivery_tags` RENAME COLUMN `task_id` TO `delivery_id`;--> statement-breakpoint
ALTER TABLE `delivery_comments` RENAME COLUMN `task_id` TO `delivery_id`;--> statement-breakpoint
ALTER TABLE `tool_uses` RENAME COLUMN `task_id` TO `delivery_id`;--> statement-breakpoint
ALTER TABLE `agenda_entries` RENAME COLUMN `task_id` TO `delivery_id`;--> statement-breakpoint
ALTER TABLE `cronograma_blocks` RENAME COLUMN `task_id` TO `delivery_id`;--> statement-breakpoint
ALTER TABLE `cronograma_blocks` RENAME COLUMN `subtask_id` TO `task_id`;--> statement-breakpoint
ALTER TABLE `project_delivery_routines` RENAME COLUMN `subtasks` TO `tasks`;--> statement-breakpoint

SET FOREIGN_KEY_CHECKS = 1;
