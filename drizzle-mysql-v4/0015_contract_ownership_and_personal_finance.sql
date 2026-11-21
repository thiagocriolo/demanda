-- A contract bridges a user's private commercial library and one workspace.
-- Existing rows are retained only long enough to receive an explicit owner;
-- this repository's development data can be recreated after this migration.
ALTER TABLE `contracts`
  ADD COLUMN `owner_user_id` char(36) NULL AFTER `workspace_id`;

UPDATE `contracts` c
INNER JOIN `businesses` b ON b.`id` = c.`business_id`
SET c.`owner_user_id` = b.`owner_user_id`
WHERE c.`owner_user_id` IS NULL;

ALTER TABLE `contracts`
  MODIFY COLUMN `owner_user_id` char(36) NOT NULL,
  DROP FOREIGN KEY `contracts_workspace_business_foreign_key`,
  ADD CONSTRAINT `contracts_owner_user_id_users_id_fk`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `contracts_business_foreign_key`
    FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `contracts_workspace_id_id_business_id_unique`
    UNIQUE (`workspace_id`, `id`, `business_id`),
  ADD INDEX `contracts_owner_workspace_updated_index`
    (`owner_user_id`, `workspace_id`, `updated_at`);

-- Finance entries are private to their owner.  Existing test data is assigned
-- to the owner of its historical workspace; all new contract rows use the
-- contract owner directly.
ALTER TABLE `financial_entries`
  ADD COLUMN `owner_user_id` char(36) NULL AFTER `workspace_id`;

UPDATE `financial_entries` f
INNER JOIN `workspaces` w ON w.`id` = f.`workspace_id`
SET f.`owner_user_id` = w.`owner_user_id`
WHERE f.`owner_user_id` IS NULL;

ALTER TABLE `financial_entries`
  MODIFY COLUMN `owner_user_id` char(36) NOT NULL,
  ADD CONSTRAINT `financial_entries_owner_user_id_users_id_fk`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `financial_entries_owner_contract_installment_unique`
    UNIQUE (`owner_user_id`, `contract_installment_id`),
  ADD INDEX `financial_entries_owner_due_status_index`
    (`owner_user_id`, `due_date`, `status`, `deleted_at`, `id`);

-- A project can only combine the workspace and business inherited from its
-- selected contract.  Legacy rows without a contract remain nullable and can
-- be recreated during the test-data reset.
ALTER TABLE `projects`
  DROP FOREIGN KEY `projects_workspace_contract_foreign_key`,
  ADD CONSTRAINT `projects_workspace_contract_business_foreign_key`
    FOREIGN KEY (`workspace_id`, `contract_id`, `business_id`)
    REFERENCES `contracts`(`workspace_id`, `id`, `business_id`)
    ON DELETE RESTRICT;
