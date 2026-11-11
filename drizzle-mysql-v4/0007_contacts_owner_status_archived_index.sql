CREATE INDEX `contacts_owner_status_archived_index` ON `contacts` (`owner_user_id`, `status`, `archived_at`);
