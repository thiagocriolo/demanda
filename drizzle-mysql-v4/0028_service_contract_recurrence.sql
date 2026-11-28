-- Runtime schema guards may have added this column before the migration CLI runs.
SET @demanda_service_recurrence_ddl = IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'service_packages'
      AND column_name = 'contract_type'
  ),
  'SELECT 1',
  'ALTER TABLE `service_packages` ADD `contract_type` varchar(16) NOT NULL DEFAULT ''one_off'''
);--> statement-breakpoint
PREPARE demanda_service_recurrence_statement FROM @demanda_service_recurrence_ddl;--> statement-breakpoint
EXECUTE demanda_service_recurrence_statement;--> statement-breakpoint
DEALLOCATE PREPARE demanda_service_recurrence_statement;
