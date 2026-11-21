CREATE TABLE `contracts` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`business_id` char(36) NOT NULL,
	`name` varchar(140) NOT NULL,
	`amount_cents` bigint NOT NULL DEFAULT 0,
	`first_due_date` date,
	`payment_method` varchar(120),
	`payment_terms` text,
	`finance_notes` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contracts_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `contracts_workspace_business_foreign_key` FOREIGN KEY (`workspace_id`,`business_id`) REFERENCES `businesses`(`workspace_id`,`id`) ON DELETE CASCADE,
	INDEX `contracts_workspace_business_archived_index` (`workspace_id`,`business_id`,`archived_at`),
	INDEX `contracts_workspace_updated_id_index` (`workspace_id`,`updated_at`,`id`)
);

CREATE TABLE `contract_installments` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`contract_id` char(36) NOT NULL,
	`number` int NOT NULL,
	`due_date` date NOT NULL,
	`amount_cents` bigint NOT NULL,
	`status_key` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `contract_installments_id` PRIMARY KEY(`id`),
	CONSTRAINT `contract_installments_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `contract_installments_contract_number_unique` UNIQUE(`workspace_id`,`contract_id`,`number`),
	CONSTRAINT `contract_installments_workspace_contract_foreign_key` FOREIGN KEY (`workspace_id`,`contract_id`) REFERENCES `contracts`(`workspace_id`,`id`) ON DELETE CASCADE,
	INDEX `contract_installments_workspace_due_status_index` (`workspace_id`,`due_date`,`status_key`)
);

ALTER TABLE `projects`
	ADD COLUMN `contract_id` char(36),
	ADD COLUMN `engagement_type` varchar(16) NOT NULL DEFAULT 'personal',
	ADD CONSTRAINT `projects_workspace_contract_foreign_key` FOREIGN KEY (`workspace_id`,`contract_id`) REFERENCES `contracts`(`workspace_id`,`id`) ON DELETE RESTRICT;

ALTER TABLE `tasks`
	ADD COLUMN `engagement_type` varchar(16) NOT NULL DEFAULT 'personal';

ALTER TABLE `task_subtasks`
	ADD COLUMN `execution_at` timestamp(3) NULL;

ALTER TABLE `financial_entries`
	ADD COLUMN `contract_id` char(36) NULL,
	ADD COLUMN `contract_installment_id` char(36) NULL,
	ADD CONSTRAINT `financial_entries_workspace_contract_foreign_key` FOREIGN KEY (`workspace_id`,`contract_id`) REFERENCES `contracts`(`workspace_id`,`id`) ON DELETE CASCADE,
	ADD CONSTRAINT `financial_entries_workspace_contract_installment_foreign_key` FOREIGN KEY (`workspace_id`,`contract_installment_id`) REFERENCES `contract_installments`(`workspace_id`,`id`) ON DELETE CASCADE,
	ADD INDEX `financial_entries_workspace_contract_index` (`workspace_id`,`contract_id`,`deleted_at`);

-- Existing projects receive a contract so all financial history can move to
-- the new owner without losing a row or changing public identifiers.
INSERT INTO `contracts` (
	`id`, `workspace_id`, `business_id`, `name`, `amount_cents`,
	`first_due_date`, `payment_method`, `payment_terms`, `finance_notes`,
	`created_at`, `updated_at`, `archived_at`
)
SELECT
	UUID(), p.`workspace_id`, p.`business_id`, p.`name`, COALESCE(p.`amount_cents`, 0),
	p.`first_due_date`, p.`payment_method`, p.`payment_terms`, p.`finance_notes`,
	p.`created_at`, p.`updated_at`, p.`archived_at`
FROM `projects` p;

UPDATE `projects` p
INNER JOIN `contracts` c
	ON c.`workspace_id` = p.`workspace_id`
	AND c.`business_id` = p.`business_id`
	AND c.`name` = p.`name`
	AND c.`created_at` = p.`created_at`
SET p.`contract_id` = c.`id`;

INSERT INTO `contract_installments` (
	`id`, `workspace_id`, `contract_id`, `number`, `due_date`, `amount_cents`,
	`status_key`, `created_at`, `updated_at`
)
SELECT UUID(), i.`workspace_id`, p.`contract_id`, i.`number`, i.`due_date`,
	i.`amount_cents`, i.`status_key`, i.`created_at`, i.`updated_at`
FROM `project_installments` i
INNER JOIN `projects` p ON p.`workspace_id` = i.`workspace_id` AND p.`id` = i.`project_id`;

UPDATE `financial_entries` f
INNER JOIN `projects` p ON p.`workspace_id` = f.`workspace_id` AND p.`id` = f.`project_id`
INNER JOIN `project_installments` old_i
	ON old_i.`workspace_id` = f.`workspace_id` AND old_i.`id` = f.`project_installment_id`
INNER JOIN `contract_installments` new_i
	ON new_i.`workspace_id` = old_i.`workspace_id`
	AND new_i.`contract_id` = p.`contract_id`
	AND new_i.`number` = old_i.`number`
SET f.`contract_id` = p.`contract_id`,
	f.`contract_installment_id` = new_i.`id`,
	f.`source` = 'contract'
WHERE f.`source` = 'project';
