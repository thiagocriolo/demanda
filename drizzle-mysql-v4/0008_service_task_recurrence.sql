ALTER TABLE `service_task_templates`
  ADD COLUMN `recurrence_type` varchar(16) NOT NULL DEFAULT 'one_off',
  ADD COLUMN `recurrence_unit` varchar(16) NULL,
  ADD COLUMN `recurrence_days` text NOT NULL DEFAULT '[]';
