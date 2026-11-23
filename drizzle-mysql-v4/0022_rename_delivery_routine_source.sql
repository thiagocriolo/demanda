-- Complete the semantic rename inside the routine snapshot table.
ALTER TABLE `project_delivery_routines`
  RENAME COLUMN `source_service_task_template_id` TO `source_service_delivery_template_id`;
