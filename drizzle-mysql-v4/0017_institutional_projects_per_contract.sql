-- Institutional projects belong to contracts, not businesses.  The old key
-- allowed only one per business, which prevented a separate phantom project
-- for each contract.
ALTER TABLE `projects` DROP INDEX `projects_workspace_business_institutional_unique`;
ALTER TABLE `projects`
  ADD `institutional_contract_id` char(36)
    GENERATED ALWAYS AS (case when `is_institutional` then `contract_id` else null end) VIRTUAL,
  ADD CONSTRAINT `projects_workspace_contract_institutional_unique`
    UNIQUE (`workspace_id`, `institutional_contract_id`);
