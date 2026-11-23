-- Institutional projects follow the contract cycle; they never carry a due
-- date or participate in the Agenda.
UPDATE `projects`
SET `end_date` = NULL
WHERE `is_institutional` = true AND `end_date` IS NOT NULL;--> statement-breakpoint

UPDATE `deliveries` d
INNER JOIN `projects` p
  ON p.`workspace_id` = d.`workspace_id` AND p.`id` = d.`project_id`
SET d.`due_date` = NULL
WHERE p.`is_institutional` = true AND d.`due_date` IS NOT NULL;--> statement-breakpoint

DELETE ae FROM `agenda_entries` ae
INNER JOIN `projects` p
  ON p.`workspace_id` = ae.`workspace_id` AND p.`id` = ae.`project_id`
WHERE ae.`entity_kind` = 'project' AND p.`is_institutional` = true;--> statement-breakpoint

DELETE ae FROM `agenda_entries` ae
INNER JOIN `deliveries` d
  ON d.`workspace_id` = ae.`workspace_id` AND d.`id` = ae.`delivery_id`
INNER JOIN `projects` p
  ON p.`workspace_id` = d.`workspace_id` AND p.`id` = d.`project_id`
WHERE ae.`entity_kind` = 'delivery' AND p.`is_institutional` = true;
