-- A contract owns its commercial and financial conditions.  Preserve the
-- existing project values only as a backwards-compatible historical snapshot
-- while the application reads and writes the contract as the source of truth.
ALTER TABLE `contracts`
	ADD COLUMN `contract_type` varchar(16) NOT NULL DEFAULT 'one_off';

UPDATE `contracts` c
INNER JOIN `projects` p
	ON p.`workspace_id` = c.`workspace_id`
	AND p.`contract_id` = c.`id`
SET c.`contract_type` = p.`contract_type`;

ALTER TABLE `contracts`
	ADD CONSTRAINT `contracts_contract_type_allowed`
	CHECK (`contract_type` in ('one_off', 'recurring'));
