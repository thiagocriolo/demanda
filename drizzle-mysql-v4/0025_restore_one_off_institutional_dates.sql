-- Version 0023 intentionally removed dates from every institutional project.
-- One-off institutional projects are scheduled work and retain the contract end date.
UPDATE `projects` p
INNER JOIN `contracts` c
  ON c.`workspace_id` = p.`workspace_id` AND c.`id` = p.`contract_id`
SET p.`end_date` = c.`end_date`
WHERE p.`is_institutional` = true
  AND c.`contract_type` = 'one_off'
  AND p.`end_date` IS NULL
  AND c.`end_date` IS NOT NULL;--> statement-breakpoint

UPDATE `deliveries` d
INNER JOIN `projects` p
  ON p.`workspace_id` = d.`workspace_id` AND p.`id` = d.`project_id`
INNER JOIN `contracts` c
  ON c.`workspace_id` = p.`workspace_id` AND c.`id` = p.`contract_id`
SET d.`due_date` = c.`end_date`
WHERE p.`is_institutional` = true
  AND c.`contract_type` = 'one_off'
  AND d.`due_date` IS NULL
  AND c.`end_date` IS NOT NULL;
