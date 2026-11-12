CREATE TABLE `task_comments` (
  `id` char(36) NOT NULL,
  `workspace_id` char(36) NOT NULL,
  `task_id` char(36) NOT NULL,
  `author_user_id` char(36) NOT NULL,
  `body` text NOT NULL,
  `created_at` timestamp(3) NOT NULL,
  `updated_at` timestamp(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `task_comments_workspace_task_created_index` (`workspace_id`,`task_id`,`created_at`,`id`),
  KEY `task_comments_author_created_index` (`author_user_id`,`created_at`),
  CONSTRAINT `task_comments_workspace_task_foreign_key` FOREIGN KEY (`workspace_id`,`task_id`) REFERENCES `tasks` (`workspace_id`,`id`) ON DELETE CASCADE,
  CONSTRAINT `task_comments_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
);
