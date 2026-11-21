ALTER TABLE `contracts`
  ADD COLUMN `start_date` date NULL AFTER `amount_cents`,
  ADD COLUMN `end_date` date NULL AFTER `start_date`,
  ADD CONSTRAINT `contracts_dates_chronological`
    CHECK (`end_date` IS NULL OR `start_date` IS NULL OR `end_date` >= `start_date`);
