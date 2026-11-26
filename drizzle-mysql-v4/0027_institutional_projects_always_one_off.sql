-- Institutional projects are always one-off and can never become recurring.
UPDATE `projects` p
LEFT JOIN `contracts` c
  ON c.`workspace_id` = p.`workspace_id` AND c.`id` = p.`contract_id`
SET
  p.`contract_type` = 'one_off',
  p.`end_date` = COALESCE(p.`end_date`, c.`end_date`)
WHERE p.`is_institutional` = true
  AND p.`contract_type` <> 'one_off';--> statement-breakpoint

UPDATE `service_package_projects`
SET `project_type` = 'one_off'
WHERE `is_institutional` = true
  AND `project_type` <> 'one_off';--> statement-breakpoint

UPDATE `service_package_deliveries` d
INNER JOIN `service_package_projects` p
  ON p.`id` = d.`service_project_id`
SET
  d.`recurrence_type` = 'one_off',
  d.`recurrence_unit` = NULL,
  d.`recurrence_days` = '[]'
WHERE p.`is_institutional` = true
  AND d.`recurrence_type` <> 'one_off';
