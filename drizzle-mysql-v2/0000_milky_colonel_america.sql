CREATE TABLE `personal_tasks` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`title` varchar(80) NOT NULL,
	`completed` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `personal_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_credentials` (
	`user_id` char(36) NOT NULL,
	`password_hash` text NOT NULL,
	`password_changed_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `user_credentials_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` char(36) NOT NULL,
	`settings` json NOT NULL DEFAULT ('{}'),
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `user_preferences_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`username` varchar(40) NOT NULL,
	`email` varchar(320) NOT NULL,
	`avatar_url` text,
	`email_verified_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`deleted_at` timestamp(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_lower_unique` UNIQUE(lower(`email`)),
	CONSTRAINT `users_username_lower_unique` UNIQUE(lower(`username`))
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`active_workspace_id` char(36),
	`token_hash` char(64) NOT NULL,
	`remembered` boolean NOT NULL DEFAULT false,
	`user_agent` varchar(512),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp(3) NOT NULL DEFAULT (now()),
	`expires_at` timestamp(3) NOT NULL,
	`revoked_at` timestamp(3),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`expires_at` timestamp(3) NOT NULL,
	`used_at` timestamp(3),
	`revoked_at` timestamp(3),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`actor_user_id` char(36),
	`action` varchar(100) NOT NULL,
	`target_type` varchar(80) NOT NULL,
	`target_id` varchar(160),
	`metadata` json NOT NULL DEFAULT ('{}'),
	`ip_address` varchar(64),
	`user_agent` varchar(512),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `connection_requests` (
	`id` char(36) NOT NULL,
	`user_a_id` char(36) NOT NULL,
	`user_b_id` char(36) NOT NULL,
	`requested_by_user_id` char(36) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`responded_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `connection_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `connection_requests_user_pair_unique` UNIQUE(`user_a_id`,`user_b_id`)
);
--> statement-breakpoint
CREATE TABLE `stored_files` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`owner_user_id` char(36) NOT NULL,
	`purpose` varchar(32) NOT NULL,
	`backend` varchar(16) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'ready',
	`storage_key` varchar(512) NOT NULL,
	`legacy_storage_key` varchar(512),
	`original_name` varchar(255) NOT NULL,
	`original_mime_type` varchar(120),
	`original_byte_size` int,
	`original_width` int,
	`original_height` int,
	`extension` varchar(16) NOT NULL,
	`mime_type` varchar(120) NOT NULL,
	`byte_size` int NOT NULL,
	`width` int,
	`height` int,
	`sha256` char(64) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`deleted_at` timestamp(3),
	CONSTRAINT `stored_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `stored_files_storage_key_unique` UNIQUE(`storage_key`)
);
--> statement-breakpoint
CREATE TABLE `user_connections` (
	`user_a_id` char(36) NOT NULL,
	`user_b_id` char(36) NOT NULL,
	`manual_connected_at` timestamp(3),
	`workspace_connected_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `user_connections_user_pair_primary_key` PRIMARY KEY(`user_a_id`,`user_b_id`)
);
--> statement-breakpoint
CREATE TABLE `user_storage_usage` (
	`user_id` char(36) NOT NULL,
	`storage_used_bytes` bigint NOT NULL DEFAULT 0,
	`storage_reserved_bytes` bigint NOT NULL DEFAULT 0,
	`storage_limit_bytes` bigint,
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `user_storage_usage_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_catalog_entries` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`key` varchar(64) NOT NULL,
	`label` varchar(80) NOT NULL,
	`icon` varchar(80),
	`color` varchar(32),
	`sort_order` int NOT NULL DEFAULT 0,
	`locked` boolean NOT NULL DEFAULT false,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `workspace_catalog_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_catalog_entries_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `workspace_catalog_entries_workspace_kind_key_unique` UNIQUE(`workspace_id`,`kind`,`key`)
);
--> statement-breakpoint
CREATE TABLE `workspace_configurations` (
	`workspace_id` char(36) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`template_gallery_version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_configurations_workspace_id` PRIMARY KEY(`workspace_id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_invitations` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`invited_by_user_id` char(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` varchar(16) NOT NULL DEFAULT 'member',
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`accepted_by_user_id` char(36),
	`accepted_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspace_invitations_pending_email_unique` UNIQUE(`workspace_id`,lower(`email`))
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`role` varchar(16) NOT NULL DEFAULT 'member',
	`joined_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_members_workspace_user_primary_key` PRIMARY KEY(`workspace_id`,`user_id`),
	CONSTRAINT `workspace_members_one_owner_unique` UNIQUE(`workspace_id`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` char(36) NOT NULL,
	`name` varchar(60) NOT NULL,
	`description` varchar(240) NOT NULL DEFAULT '',
	`icon` varchar(80) NOT NULL DEFAULT 'briefcase-business',
	`color` varchar(32) NOT NULL DEFAULT 'blue',
	`kind` varchar(16) NOT NULL DEFAULT 'shared',
	`owner_user_id` char(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `workspaces_id` PRIMARY KEY(`id`),
	CONSTRAINT `workspaces_personal_owner_unique` UNIQUE(`owner_user_id`)
);
--> statement-breakpoint
CREATE TABLE `communities` (
	`id` char(36) NOT NULL,
	`owner_user_id` char(36) NOT NULL,
	`cover_file_id` char(36),
	`link_name` varchar(40) NOT NULL,
	`name` varchar(80) NOT NULL,
	`description` varchar(240) NOT NULL,
	`topic` varchar(60) NOT NULL,
	`visibility` varchar(16) NOT NULL DEFAULT 'public',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`deleted_at` timestamp(3),
	CONSTRAINT `communities_id` PRIMARY KEY(`id`),
	CONSTRAINT `communities_link_name_unique` UNIQUE(`link_name`)
);
--> statement-breakpoint
CREATE TABLE `community_invitations` (
	`id` char(36) NOT NULL,
	`community_id` char(36) NOT NULL,
	`invited_user_id` char(36) NOT NULL,
	`invited_by_user_id` char(36) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`invited_at` timestamp(3) NOT NULL DEFAULT (now()),
	`accepted_at` timestamp(3),
	CONSTRAINT `community_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `community_invitations_community_user_unique` UNIQUE(`community_id`,`invited_user_id`)
);
--> statement-breakpoint
CREATE TABLE `community_join_requests` (
	`id` char(36) NOT NULL,
	`community_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`requested_at` timestamp(3) NOT NULL DEFAULT (now()),
	`reviewed_at` timestamp(3),
	`reviewed_by_user_id` char(36),
	CONSTRAINT `community_join_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `community_join_requests_community_user_unique` UNIQUE(`community_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `community_members` (
	`community_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`role` varchar(16) NOT NULL DEFAULT 'member',
	`joined_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `community_members_community_id_user_id_pk` PRIMARY KEY(`community_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `social_comment_likes` (
	`comment_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `social_comment_likes_comment_user_primary_key` PRIMARY KEY(`comment_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `social_post_blocks` (
	`id` char(36) NOT NULL,
	`post_id` char(36) NOT NULL,
	`kind` varchar(16) NOT NULL,
	`text_content` text,
	`file_id` char(36),
	`caption` varchar(240),
	`position` int NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `social_post_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `social_post_blocks_post_position_unique` UNIQUE(`post_id`,`position`)
);
--> statement-breakpoint
CREATE TABLE `social_post_comments` (
	`id` char(36) NOT NULL,
	`post_id` char(36) NOT NULL,
	`parent_comment_id` char(36),
	`author_user_id` char(36) NOT NULL,
	`body` text NOT NULL,
	`depth` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`deleted_at` timestamp(3),
	CONSTRAINT `social_post_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `social_post_likes` (
	`post_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `social_post_likes_post_user_primary_key` PRIMARY KEY(`post_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `social_posts` (
	`id` char(36) NOT NULL,
	`author_user_id` char(36) NOT NULL,
	`community_id` char(36),
	`kind` varchar(16) NOT NULL,
	`title` varchar(160),
	`body` text,
	`link_url` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`deleted_at` timestamp(3),
	CONSTRAINT `social_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_notes` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`business_id` char(36) NOT NULL,
	`body` text NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `business_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_responsibles` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`business_id` char(36) NOT NULL,
	`contact_id` char(36),
	`user_id` char(36),
	`sort_order` int,
	CONSTRAINT `business_responsibles_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_responsibles_business_contact_unique` UNIQUE(`workspace_id`,`business_id`,`contact_id`),
	CONSTRAINT `business_responsibles_business_user_unique` UNIQUE(`workspace_id`,`business_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`owner_user_id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`category_key` varchar(64) NOT NULL,
	`stage_key` varchar(64) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `businesses_id` PRIMARY KEY(`id`),
	CONSTRAINT `businesses_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_emails` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`contact_id` char(36) NOT NULL,
	`type` varchar(16) NOT NULL DEFAULT 'personal',
	`address` varchar(320) NOT NULL,
	`label` varchar(80),
	`is_primary` boolean NOT NULL DEFAULT false,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_emails_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_emails_workspace_contact_address_unique` UNIQUE(`workspace_id`,`contact_id`,`address`),
	CONSTRAINT `contact_emails_one_primary_unique` UNIQUE(`workspace_id`,`contact_id`)
);
--> statement-breakpoint
CREATE TABLE `contact_notes` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`contact_id` char(36) NOT NULL,
	`body` text NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `contact_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_phones` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`contact_id` char(36) NOT NULL,
	`type` varchar(16) NOT NULL DEFAULT 'mobile',
	`number` varchar(16) NOT NULL,
	`label` varchar(80),
	`is_primary` boolean NOT NULL DEFAULT false,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_phones_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_phones_workspace_contact_number_unique` UNIQUE(`workspace_id`,`contact_id`,`number`),
	CONSTRAINT `contact_phones_one_primary_unique` UNIQUE(`workspace_id`,`contact_id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`owner_user_id` char(36) NOT NULL,
	`linked_user_id` char(36),
	`name` varchar(120) NOT NULL,
	`contact_type` varchar(16) NOT NULL DEFAULT 'person',
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`profession` varchar(120),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contacts_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `contacts_owner_linked_user_unique` UNIQUE(`owner_user_id`,`linked_user_id`)
);
--> statement-breakpoint
CREATE TABLE `delivery_template_responsibles` (
	`workspace_id` char(36) NOT NULL,
	`delivery_template_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `delivery_template_responsibles_workspace_template_user_primary_key` PRIMARY KEY(`workspace_id`,`delivery_template_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `delivery_template_subtasks` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`delivery_template_id` char(36) NOT NULL,
	`name` varchar(140) NOT NULL,
	`duration_minutes` int NOT NULL,
	`default_status_key` varchar(64) NOT NULL DEFAULT 'pendente',
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `delivery_template_subtasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `delivery_template_tags` (
	`workspace_id` char(36) NOT NULL,
	`delivery_template_id` char(36) NOT NULL,
	`tag_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `delivery_template_tags_workspace_template_tag_primary_key` PRIMARY KEY(`workspace_id`,`delivery_template_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `delivery_templates` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`service_id` char(36),
	`name` varchar(140) NOT NULL,
	`description` text NOT NULL DEFAULT (''),
	`category_key` varchar(64),
	`default_status_key` varchar(64) NOT NULL DEFAULT 'planejamento',
	`default_priority_key` varchar(64) NOT NULL DEFAULT 'normal',
	`default_duration_minutes` int,
	`sort_order` int NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `delivery_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `delivery_templates_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `delivery_templates_workspace_active_name_unique` UNIQUE(`workspace_id`,lower(`name`))
);
--> statement-breakpoint
CREATE TABLE `service_responsibles` (
	`workspace_id` char(36) NOT NULL,
	`service_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `service_responsibles_workspace_service_user_primary_key` PRIMARY KEY(`workspace_id`,`service_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `service_tags` (
	`workspace_id` char(36) NOT NULL,
	`service_id` char(36) NOT NULL,
	`tag_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `service_tags_workspace_service_tag_primary_key` PRIMARY KEY(`workspace_id`,`service_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `service_task_templates` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`service_id` char(36) NOT NULL,
	`delivery_template_id` char(36) NOT NULL,
	`name` varchar(140) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `service_task_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_task_templates_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`name` varchar(140) NOT NULL,
	`description` text NOT NULL DEFAULT (''),
	`default_briefing` text NOT NULL DEFAULT (''),
	`icon` varchar(80) NOT NULL DEFAULT 'briefcase-business',
	`color` varchar(32) NOT NULL DEFAULT 'blue',
	`default_status_key` varchar(64) NOT NULL DEFAULT 'planejamento',
	`default_duration_days` int,
	`default_contract_type` varchar(16) NOT NULL DEFAULT 'one_off',
	`default_amount_cents` bigint,
	`default_installment_count` int NOT NULL DEFAULT 1,
	`default_payment_method` varchar(120),
	`default_payment_terms` text,
	`default_finance_notes` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `services_id` PRIMARY KEY(`id`),
	CONSTRAINT `services_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `services_workspace_active_name_unique` UNIQUE(`workspace_id`,lower(`name`))
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`key` varchar(64) NOT NULL,
	`label` varchar(80) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `tags_workspace_key_unique` UNIQUE(`workspace_id`,`key`)
);
--> statement-breakpoint
CREATE TABLE `project_responsibles` (
	`workspace_id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `project_responsibles_workspace_project_user_primary_key` PRIMARY KEY(`workspace_id`,`project_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `project_services` (
	`workspace_id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`service_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `project_services_workspace_project_service_primary_key` PRIMARY KEY(`workspace_id`,`project_id`,`service_id`)
);
--> statement-breakpoint
CREATE TABLE `project_tags` (
	`workspace_id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`tag_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `project_tags_workspace_project_tag_primary_key` PRIMARY KEY(`workspace_id`,`project_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`business_id` char(36) NOT NULL,
	`source_service_id` char(36),
	`is_institutional` boolean NOT NULL DEFAULT false,
	`name` varchar(140) NOT NULL,
	`status_key` varchar(64) NOT NULL,
	`briefing` text NOT NULL DEFAULT (''),
	`start_date` date,
	`end_date` date,
	`contract_type` varchar(16) NOT NULL DEFAULT 'one_off',
	`amount_cents` bigint,
	`first_due_date` date,
	`payment_method` varchar(120),
	`payment_terms` text,
	`finance_notes` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `projects_workspace_id_business_id_unique` UNIQUE(`workspace_id`,`id`,`business_id`),
	CONSTRAINT `projects_workspace_business_institutional_unique` UNIQUE(`workspace_id`,`business_id`)
);
--> statement-breakpoint
CREATE TABLE `financial_entries` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`project_id` char(36),
	`project_installment_id` char(36),
	`source` varchar(16) NOT NULL,
	`type` varchar(16) NOT NULL,
	`mode` varchar(16) NOT NULL,
	`title` varchar(160) NOT NULL,
	`category` varchar(120) NOT NULL DEFAULT '',
	`notes` text NOT NULL DEFAULT (''),
	`amount` decimal(18,2) NOT NULL,
	`competence_date` date NOT NULL,
	`due_date` date NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'open',
	`settled_at` timestamp(3),
	`settled_by_user_id` char(36),
	`series_id` char(36),
	`series_kind` varchar(16),
	`series_number` int,
	`series_count` int,
	`version` int NOT NULL DEFAULT 1,
	`created_by_user_id` char(36) NOT NULL,
	`updated_by_user_id` char(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`deleted_at` timestamp(3),
	CONSTRAINT `financial_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `financial_entries_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `financial_entries_workspace_project_installment_unique` UNIQUE(`workspace_id`,`project_installment_id`)
);
--> statement-breakpoint
CREATE TABLE `project_installments` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`number` int NOT NULL,
	`due_date` date NOT NULL,
	`amount_cents` bigint NOT NULL,
	`status_key` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `project_installments_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_installments_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `project_installments_project_number_unique` UNIQUE(`workspace_id`,`project_id`,`number`)
);
--> statement-breakpoint
CREATE TABLE `task_responsibles` (
	`workspace_id` char(36) NOT NULL,
	`task_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `task_responsibles_workspace_task_user_primary_key` PRIMARY KEY(`workspace_id`,`task_id`,`user_id`),
	CONSTRAINT `task_responsibles_workspace_task_unique` UNIQUE(`workspace_id`,`task_id`)
);
--> statement-breakpoint
CREATE TABLE `task_subtasks` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`task_id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`duration_minutes` int NOT NULL DEFAULT 60,
	`status_key` varchar(64) NOT NULL DEFAULT 'pendente',
	`sort_order` int NOT NULL DEFAULT 0,
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `task_subtasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_subtasks_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `task_subtasks_workspace_id_task_unique` UNIQUE(`workspace_id`,`id`,`task_id`)
);
--> statement-breakpoint
CREATE TABLE `task_tags` (
	`workspace_id` char(36) NOT NULL,
	`task_id` char(36) NOT NULL,
	`tag_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `task_tags_workspace_task_tag_primary_key` PRIMARY KEY(`workspace_id`,`task_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`business_id` char(36) NOT NULL,
	`name` varchar(140) NOT NULL,
	`description` text NOT NULL DEFAULT (''),
	`category_key` varchar(64),
	`priority_key` varchar(64) NOT NULL DEFAULT 'normal',
	`status_key` varchar(64) NOT NULL DEFAULT 'planejamento',
	`due_date` date,
	`sort_order` int NOT NULL DEFAULT 0,
	`board_order` json NOT NULL DEFAULT ('{}'),
	`version` int NOT NULL DEFAULT 1,
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `tasks_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `tool_models` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`created_by_user_id` char(36) NOT NULL,
	`tool_key` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500) NOT NULL DEFAULT '',
	`config` json NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `tool_models_id` PRIMARY KEY(`id`),
	CONSTRAINT `tool_models_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `tool_responses` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`use_id` char(36) NOT NULL,
	`respondent_user_id` char(36) NOT NULL,
	`payload` json NOT NULL,
	`submitted_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `tool_responses_id` PRIMARY KEY(`id`),
	CONSTRAINT `tool_responses_workspace_use_respondent_unique` UNIQUE(`workspace_id`,`use_id`,`respondent_user_id`)
);
--> statement-breakpoint
CREATE TABLE `tool_uses` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`created_by_user_id` char(36) NOT NULL,
	`model_id` char(36) NOT NULL,
	`task_id` char(36),
	`tool_key` varchar(32) NOT NULL,
	`name` varchar(140) NOT NULL,
	`config_snapshot` json NOT NULL,
	`content` json NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'draft',
	`version` int NOT NULL DEFAULT 1,
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `tool_uses_id` PRIMARY KEY(`id`),
	CONSTRAINT `tool_uses_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `agenda_entries` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`entity_kind` varchar(16) NOT NULL,
	`project_id` char(36),
	`task_id` char(36),
	`scheduled_date` date,
	`position` int NOT NULL DEFAULT 0,
	`duration_minutes` int NOT NULL DEFAULT 60,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `agenda_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `agenda_entries_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `agenda_entries_workspace_project_unique` UNIQUE(`workspace_id`,`project_id`),
	CONSTRAINT `agenda_entries_workspace_task_unique` UNIQUE(`workspace_id`,`task_id`),
	CONSTRAINT `agenda_entries_workspace_kind_date_position_unique` UNIQUE(`workspace_id`,`entity_kind`,`scheduled_date`,`position`)
);
--> statement-breakpoint
CREATE TABLE `cronograma_blocks` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`task_id` char(36) NOT NULL,
	`subtask_id` char(36) NOT NULL,
	`scheduled_date` date NOT NULL,
	`start_minutes` int NOT NULL,
	`duration_minutes` int NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `cronograma_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `cronograma_blocks_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `cronograma_blocks_workspace_subtask_unique` UNIQUE(`workspace_id`,`subtask_id`)
);
--> statement-breakpoint
ALTER TABLE `personal_tasks` ADD CONSTRAINT `personal_tasks_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_credentials` ADD CONSTRAINT `user_credentials_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD CONSTRAINT `user_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_active_workspace_id_workspaces_id_fk` FOREIGN KEY (`active_workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `connection_requests` ADD CONSTRAINT `connection_requests_user_a_id_users_id_fk` FOREIGN KEY (`user_a_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `connection_requests` ADD CONSTRAINT `connection_requests_user_b_id_users_id_fk` FOREIGN KEY (`user_b_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `connection_requests` ADD CONSTRAINT `connection_requests_requested_by_user_id_users_id_fk` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stored_files` ADD CONSTRAINT `stored_files_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stored_files` ADD CONSTRAINT `stored_files_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_connections` ADD CONSTRAINT `user_connections_user_a_id_users_id_fk` FOREIGN KEY (`user_a_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_connections` ADD CONSTRAINT `user_connections_user_b_id_users_id_fk` FOREIGN KEY (`user_b_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_storage_usage` ADD CONSTRAINT `user_storage_usage_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_catalog_entries` ADD CONSTRAINT `workspace_catalog_entries_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_configurations` ADD CONSTRAINT `workspace_configurations_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD CONSTRAINT `workspace_invitations_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD CONSTRAINT `workspace_invitations_invited_by_user_id_users_id_fk` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_invitations` ADD CONSTRAINT `workspace_invitations_accepted_by_user_id_users_id_fk` FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaces` ADD CONSTRAINT `workspaces_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communities` ADD CONSTRAINT `communities_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communities` ADD CONSTRAINT `communities_cover_file_id_stored_files_id_fk` FOREIGN KEY (`cover_file_id`) REFERENCES `stored_files`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_invitations` ADD CONSTRAINT `community_invitations_community_id_communities_id_fk` FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_invitations` ADD CONSTRAINT `community_invitations_invited_user_id_users_id_fk` FOREIGN KEY (`invited_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_invitations` ADD CONSTRAINT `community_invitations_invited_by_user_id_users_id_fk` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_join_requests` ADD CONSTRAINT `community_join_requests_community_id_communities_id_fk` FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_join_requests` ADD CONSTRAINT `community_join_requests_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_join_requests` ADD CONSTRAINT `community_join_requests_reviewed_by_user_id_users_id_fk` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_members` ADD CONSTRAINT `community_members_community_id_communities_id_fk` FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_members` ADD CONSTRAINT `community_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_comment_likes` ADD CONSTRAINT `social_comment_likes_comment_id_social_post_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `social_post_comments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_comment_likes` ADD CONSTRAINT `social_comment_likes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_post_blocks` ADD CONSTRAINT `social_post_blocks_post_id_social_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_post_blocks` ADD CONSTRAINT `social_post_blocks_file_id_stored_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `stored_files`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_post_comments` ADD CONSTRAINT `social_post_comments_post_id_social_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_post_comments` ADD CONSTRAINT `social_post_comments_parent_comment_id_social_post_comments_id_fk` FOREIGN KEY (`parent_comment_id`) REFERENCES `social_post_comments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_post_comments` ADD CONSTRAINT `social_post_comments_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_post_likes` ADD CONSTRAINT `social_post_likes_post_id_social_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `social_posts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_post_likes` ADD CONSTRAINT `social_post_likes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_posts` ADD CONSTRAINT `social_posts_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_posts` ADD CONSTRAINT `social_posts_community_id_communities_id_fk` FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_notes` ADD CONSTRAINT `business_notes_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_notes` ADD CONSTRAINT `business_notes_workspace_business_foreign_key` FOREIGN KEY (`workspace_id`,`business_id`) REFERENCES `businesses`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_responsibles` ADD CONSTRAINT `business_responsibles_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_responsibles` ADD CONSTRAINT `business_responsibles_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_responsibles` ADD CONSTRAINT `business_responsibles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_responsibles` ADD CONSTRAINT `business_responsibles_workspace_business_foreign_key` FOREIGN KEY (`workspace_id`,`business_id`) REFERENCES `businesses`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_responsibles` ADD CONSTRAINT `business_responsibles_workspace_contact_foreign_key` FOREIGN KEY (`workspace_id`,`contact_id`) REFERENCES `contacts`(`workspace_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `businesses` ADD CONSTRAINT `businesses_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `businesses` ADD CONSTRAINT `businesses_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contact_emails` ADD CONSTRAINT `contact_emails_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contact_emails` ADD CONSTRAINT `contact_emails_workspace_contact_foreign_key` FOREIGN KEY (`workspace_id`,`contact_id`) REFERENCES `contacts`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contact_notes` ADD CONSTRAINT `contact_notes_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contact_notes` ADD CONSTRAINT `contact_notes_workspace_contact_foreign_key` FOREIGN KEY (`workspace_id`,`contact_id`) REFERENCES `contacts`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contact_phones` ADD CONSTRAINT `contact_phones_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contact_phones` ADD CONSTRAINT `contact_phones_workspace_contact_foreign_key` FOREIGN KEY (`workspace_id`,`contact_id`) REFERENCES `contacts`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_linked_user_id_users_id_fk` FOREIGN KEY (`linked_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_template_responsibles` ADD CONSTRAINT `delivery_template_responsibles_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_template_responsibles` ADD CONSTRAINT `delivery_template_responsibles_workspace_template_foreign_key` FOREIGN KEY (`workspace_id`,`delivery_template_id`) REFERENCES `delivery_templates`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_template_responsibles` ADD CONSTRAINT `delivery_template_responsibles_workspace_member_foreign_key` FOREIGN KEY (`workspace_id`,`user_id`) REFERENCES `workspace_members`(`workspace_id`,`user_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_template_subtasks` ADD CONSTRAINT `delivery_template_subtasks_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_template_subtasks` ADD CONSTRAINT `delivery_template_subtasks_workspace_template_foreign_key` FOREIGN KEY (`workspace_id`,`delivery_template_id`) REFERENCES `delivery_templates`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_template_tags` ADD CONSTRAINT `delivery_template_tags_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_template_tags` ADD CONSTRAINT `delivery_template_tags_workspace_template_foreign_key` FOREIGN KEY (`workspace_id`,`delivery_template_id`) REFERENCES `delivery_templates`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_template_tags` ADD CONSTRAINT `delivery_template_tags_workspace_tag_foreign_key` FOREIGN KEY (`workspace_id`,`tag_id`) REFERENCES `tags`(`workspace_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_templates` ADD CONSTRAINT `delivery_templates_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_templates` ADD CONSTRAINT `delivery_templates_workspace_service_foreign_key` FOREIGN KEY (`workspace_id`,`service_id`) REFERENCES `services`(`workspace_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_responsibles` ADD CONSTRAINT `service_responsibles_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_responsibles` ADD CONSTRAINT `service_responsibles_workspace_service_foreign_key` FOREIGN KEY (`workspace_id`,`service_id`) REFERENCES `services`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_responsibles` ADD CONSTRAINT `service_responsibles_workspace_member_foreign_key` FOREIGN KEY (`workspace_id`,`user_id`) REFERENCES `workspace_members`(`workspace_id`,`user_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_tags` ADD CONSTRAINT `service_tags_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_tags` ADD CONSTRAINT `service_tags_workspace_service_foreign_key` FOREIGN KEY (`workspace_id`,`service_id`) REFERENCES `services`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_tags` ADD CONSTRAINT `service_tags_workspace_tag_foreign_key` FOREIGN KEY (`workspace_id`,`tag_id`) REFERENCES `tags`(`workspace_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_templates` ADD CONSTRAINT `service_task_templates_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_templates` ADD CONSTRAINT `service_task_templates_workspace_service_foreign_key` FOREIGN KEY (`workspace_id`,`service_id`) REFERENCES `services`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_templates` ADD CONSTRAINT `service_task_templates_workspace_template_foreign_key` FOREIGN KEY (`workspace_id`,`delivery_template_id`) REFERENCES `delivery_templates`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `services` ADD CONSTRAINT `services_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tags` ADD CONSTRAINT `tags_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_responsibles` ADD CONSTRAINT `project_responsibles_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_responsibles` ADD CONSTRAINT `project_responsibles_workspace_project_foreign_key` FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_responsibles` ADD CONSTRAINT `project_responsibles_workspace_member_foreign_key` FOREIGN KEY (`workspace_id`,`user_id`) REFERENCES `workspace_members`(`workspace_id`,`user_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_services` ADD CONSTRAINT `project_services_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_services` ADD CONSTRAINT `project_services_workspace_project_foreign_key` FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_services` ADD CONSTRAINT `project_services_workspace_service_foreign_key` FOREIGN KEY (`workspace_id`,`service_id`) REFERENCES `services`(`workspace_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_tags` ADD CONSTRAINT `project_tags_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_tags` ADD CONSTRAINT `project_tags_workspace_project_foreign_key` FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_tags` ADD CONSTRAINT `project_tags_workspace_tag_foreign_key` FOREIGN KEY (`workspace_id`,`tag_id`) REFERENCES `tags`(`workspace_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_business_id_businesses_id_fk` FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_workspace_source_service_foreign_key` FOREIGN KEY (`workspace_id`,`source_service_id`) REFERENCES `services`(`workspace_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_entries` ADD CONSTRAINT `financial_entries_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_entries` ADD CONSTRAINT `financial_entries_settled_by_user_id_users_id_fk` FOREIGN KEY (`settled_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_entries` ADD CONSTRAINT `financial_entries_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_entries` ADD CONSTRAINT `financial_entries_updated_by_user_id_users_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_entries` ADD CONSTRAINT `financial_entries_workspace_project_foreign_key` FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_entries` ADD CONSTRAINT `financial_entries_workspace_project_installment_foreign_key` FOREIGN KEY (`workspace_id`,`project_installment_id`) REFERENCES `project_installments`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_installments` ADD CONSTRAINT `project_installments_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_installments` ADD CONSTRAINT `project_installments_workspace_project_foreign_key` FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_responsibles` ADD CONSTRAINT `task_responsibles_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_responsibles` ADD CONSTRAINT `task_responsibles_workspace_task_foreign_key` FOREIGN KEY (`workspace_id`,`task_id`) REFERENCES `tasks`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_responsibles` ADD CONSTRAINT `task_responsibles_workspace_member_foreign_key` FOREIGN KEY (`workspace_id`,`user_id`) REFERENCES `workspace_members`(`workspace_id`,`user_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_subtasks` ADD CONSTRAINT `task_subtasks_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_subtasks` ADD CONSTRAINT `task_subtasks_workspace_task_foreign_key` FOREIGN KEY (`workspace_id`,`task_id`) REFERENCES `tasks`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_tags` ADD CONSTRAINT `task_tags_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_tags` ADD CONSTRAINT `task_tags_workspace_task_foreign_key` FOREIGN KEY (`workspace_id`,`task_id`) REFERENCES `tasks`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_tags` ADD CONSTRAINT `task_tags_workspace_tag_foreign_key` FOREIGN KEY (`workspace_id`,`tag_id`) REFERENCES `tags`(`workspace_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_workspace_project_business_foreign_key` FOREIGN KEY (`workspace_id`,`project_id`,`business_id`) REFERENCES `projects`(`workspace_id`,`id`,`business_id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `tool_models` ADD CONSTRAINT `tool_models_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tool_models` ADD CONSTRAINT `tool_models_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tool_responses` ADD CONSTRAINT `tool_responses_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tool_responses` ADD CONSTRAINT `tool_responses_respondent_user_id_users_id_fk` FOREIGN KEY (`respondent_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tool_responses` ADD CONSTRAINT `tool_responses_workspace_use_foreign_key` FOREIGN KEY (`workspace_id`,`use_id`) REFERENCES `tool_uses`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tool_uses` ADD CONSTRAINT `tool_uses_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tool_uses` ADD CONSTRAINT `tool_uses_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tool_uses` ADD CONSTRAINT `tool_uses_workspace_model_foreign_key` FOREIGN KEY (`workspace_id`,`model_id`) REFERENCES `tool_models`(`workspace_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tool_uses` ADD CONSTRAINT `tool_uses_workspace_task_foreign_key` FOREIGN KEY (`workspace_id`,`task_id`) REFERENCES `tasks`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agenda_entries` ADD CONSTRAINT `agenda_entries_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agenda_entries` ADD CONSTRAINT `agenda_entries_workspace_project_foreign_key` FOREIGN KEY (`workspace_id`,`project_id`) REFERENCES `projects`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agenda_entries` ADD CONSTRAINT `agenda_entries_workspace_task_foreign_key` FOREIGN KEY (`workspace_id`,`task_id`) REFERENCES `tasks`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_workspace_task_foreign_key` FOREIGN KEY (`workspace_id`,`task_id`) REFERENCES `tasks`(`workspace_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_workspace_subtask_foreign_key` FOREIGN KEY (`workspace_id`,`subtask_id`,`task_id`) REFERENCES `task_subtasks`(`workspace_id`,`id`,`task_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `personal_tasks_user_order_index` ON `personal_tasks` (`user_id`,`sort_order`,`created_at`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_id_index` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_active_workspace_id_index` ON `auth_sessions` (`active_workspace_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_at_index` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_id_index` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_expires_at_index` ON `password_reset_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_workspace_created_at_index` ON `audit_logs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_user_id_index` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `connection_requests_recipient_status_index` ON `connection_requests` (`user_b_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `stored_files_workspace_created_index` ON `stored_files` (`workspace_id`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `stored_files_owner_user_id_index` ON `stored_files` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `stored_files_status_updated_index` ON `stored_files` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `user_connections_user_b_id_index` ON `user_connections` (`user_b_id`);--> statement-breakpoint
CREATE INDEX `workspace_catalog_entries_workspace_kind_order_index` ON `workspace_catalog_entries` (`workspace_id`,`kind`,`archived_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `workspace_invitations_workspace_status_index` ON `workspace_invitations` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `workspace_invitations_email_status_index` ON `workspace_invitations` (`email`,`status`);--> statement-breakpoint
CREATE INDEX `workspace_members_user_id_index` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `workspaces_owner_user_id_index` ON `workspaces` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `communities_owner_created_index` ON `communities` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `communities_cover_file_index` ON `communities` (`cover_file_id`);--> statement-breakpoint
CREATE INDEX `community_invitations_invited_user_status_index` ON `community_invitations` (`invited_user_id`,`status`,`invited_at`);--> statement-breakpoint
CREATE INDEX `community_join_requests_pending_index` ON `community_join_requests` (`community_id`,`status`,`requested_at`);--> statement-breakpoint
CREATE INDEX `community_members_user_joined_index` ON `community_members` (`user_id`,`joined_at`);--> statement-breakpoint
CREATE INDEX `social_comment_likes_user_created_index` ON `social_comment_likes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_post_blocks_file_id_index` ON `social_post_blocks` (`file_id`);--> statement-breakpoint
CREATE INDEX `social_post_comments_post_created_index` ON `social_post_comments` (`post_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_post_comments_author_index` ON `social_post_comments` (`author_user_id`);--> statement-breakpoint
CREATE INDEX `social_post_comments_parent_created_index` ON `social_post_comments` (`parent_comment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_post_likes_user_created_index` ON `social_post_likes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_posts_author_created_index` ON `social_posts` (`author_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_posts_kind_created_index` ON `social_posts` (`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_posts_community_created_index` ON `social_posts` (`community_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `business_notes_workspace_business_created_index` ON `business_notes` (`workspace_id`,`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `business_notes_workspace_business_order_index` ON `business_notes` (`workspace_id`,`business_id`,`archived_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `business_responsibles_workspace_contact_index` ON `business_responsibles` (`workspace_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `business_responsibles_user_index` ON `business_responsibles` (`user_id`);--> statement-breakpoint
CREATE INDEX `business_responsibles_workspace_business_order_index` ON `business_responsibles` (`workspace_id`,`business_id`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `businesses_owner_updated_id_index` ON `businesses` (`owner_user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `businesses_owner_stage_archived_index` ON `businesses` (`owner_user_id`,`stage_key`,`archived_at`);--> statement-breakpoint
CREATE INDEX `businesses_owner_category_archived_index` ON `businesses` (`owner_user_id`,`category_key`,`archived_at`);--> statement-breakpoint
CREATE INDEX `businesses_owner_name_lower_index` ON `businesses` (`owner_user_id`,lower(`name`));--> statement-breakpoint
CREATE INDEX `businesses_name_search_index` ON `businesses` (`name`);--> statement-breakpoint
CREATE INDEX `contact_emails_workspace_address_index` ON `contact_emails` (`workspace_id`,`address`);--> statement-breakpoint
CREATE INDEX `contact_notes_workspace_contact_created_index` ON `contact_notes` (`workspace_id`,`contact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_phones_workspace_number_index` ON `contact_phones` (`workspace_id`,`number`);--> statement-breakpoint
CREATE INDEX `delivery_template_subtasks_workspace_template_order_index` ON `delivery_template_subtasks` (`workspace_id`,`delivery_template_id`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `delivery_templates_workspace_service_order_index` ON `delivery_templates` (`workspace_id`,`service_id`,`archived_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `service_responsibles_workspace_service_order_index` ON `service_responsibles` (`workspace_id`,`service_id`,`sort_order`,`user_id`);--> statement-breakpoint
CREATE INDEX `service_responsibles_workspace_user_service_index` ON `service_responsibles` (`workspace_id`,`user_id`,`service_id`);--> statement-breakpoint
CREATE INDEX `service_tags_workspace_service_order_index` ON `service_tags` (`workspace_id`,`service_id`,`sort_order`,`tag_id`);--> statement-breakpoint
CREATE INDEX `service_tags_workspace_tag_service_index` ON `service_tags` (`workspace_id`,`tag_id`,`service_id`);--> statement-breakpoint
CREATE INDEX `service_task_templates_workspace_service_order_index` ON `service_task_templates` (`workspace_id`,`service_id`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `service_task_templates_workspace_template_index` ON `service_task_templates` (`workspace_id`,`delivery_template_id`);--> statement-breakpoint
CREATE INDEX `services_workspace_updated_id_index` ON `services` (`workspace_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `services_workspace_archived_name_index` ON `services` (`workspace_id`,`archived_at`,lower(`name`));--> statement-breakpoint
CREATE INDEX `services_workspace_archived_order_index` ON `services` (`workspace_id`,`archived_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `tags_workspace_archived_key_index` ON `tags` (`workspace_id`,`archived_at`,`sort_order`,`key`);--> statement-breakpoint
CREATE INDEX `tags_workspace_label_lower_index` ON `tags` (`workspace_id`,lower(`label`));--> statement-breakpoint
CREATE INDEX `project_responsibles_workspace_project_order_index` ON `project_responsibles` (`workspace_id`,`project_id`,`sort_order`,`user_id`);--> statement-breakpoint
CREATE INDEX `project_responsibles_workspace_user_project_index` ON `project_responsibles` (`workspace_id`,`user_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `project_services_workspace_project_order_index` ON `project_services` (`workspace_id`,`project_id`,`sort_order`,`service_id`);--> statement-breakpoint
CREATE INDEX `project_services_workspace_service_project_index` ON `project_services` (`workspace_id`,`service_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `project_tags_workspace_project_order_index` ON `project_tags` (`workspace_id`,`project_id`,`sort_order`,`tag_id`);--> statement-breakpoint
CREATE INDEX `project_tags_workspace_tag_project_index` ON `project_tags` (`workspace_id`,`tag_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `projects_workspace_updated_id_index` ON `projects` (`workspace_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `projects_workspace_status_archived_index` ON `projects` (`workspace_id`,`status_key`,`archived_at`);--> statement-breakpoint
CREATE INDEX `projects_workspace_business_archived_index` ON `projects` (`workspace_id`,`business_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `projects_workspace_source_service_index` ON `projects` (`workspace_id`,`source_service_id`);--> statement-breakpoint
CREATE INDEX `projects_workspace_name_lower_index` ON `projects` (`workspace_id`,lower(`name`));--> statement-breakpoint
CREATE INDEX `projects_name_search_index` ON `projects` (`name`);--> statement-breakpoint
CREATE INDEX `projects_workspace_end_status_archive_index` ON `projects` (`workspace_id`,`end_date`,`status_key`,`archived_at`);--> statement-breakpoint
CREATE INDEX `financial_entries_workspace_due_status_index` ON `financial_entries` (`workspace_id`,`due_date`,`status`,`deleted_at`,`id`);--> statement-breakpoint
CREATE INDEX `financial_entries_workspace_competence_type_index` ON `financial_entries` (`workspace_id`,`competence_date`,`type`,`deleted_at`,`id`);--> statement-breakpoint
CREATE INDEX `financial_entries_workspace_series_index` ON `financial_entries` (`workspace_id`,`series_id`,`series_number`);--> statement-breakpoint
CREATE INDEX `financial_entries_workspace_project_index` ON `financial_entries` (`workspace_id`,`project_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `project_installments_workspace_project_number_index` ON `project_installments` (`workspace_id`,`project_id`,`number`);--> statement-breakpoint
CREATE INDEX `project_installments_workspace_due_status_index` ON `project_installments` (`workspace_id`,`due_date`,`status_key`);--> statement-breakpoint
CREATE INDEX `task_responsibles_workspace_task_order_index` ON `task_responsibles` (`workspace_id`,`task_id`,`sort_order`,`user_id`);--> statement-breakpoint
CREATE INDEX `task_responsibles_workspace_user_task_index` ON `task_responsibles` (`workspace_id`,`user_id`,`task_id`);--> statement-breakpoint
CREATE INDEX `task_subtasks_workspace_task_archived_order_index` ON `task_subtasks` (`workspace_id`,`task_id`,`archived_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `task_subtasks_workspace_status_completion_index` ON `task_subtasks` (`workspace_id`,`status_key`,`completed_at`,`id`);--> statement-breakpoint
CREATE INDEX `task_tags_workspace_task_order_index` ON `task_tags` (`workspace_id`,`task_id`,`sort_order`,`tag_id`);--> statement-breakpoint
CREATE INDEX `task_tags_workspace_tag_task_index` ON `task_tags` (`workspace_id`,`tag_id`,`task_id`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_updated_id_index` ON `tasks` (`workspace_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_project_archived_order_index` ON `tasks` (`workspace_id`,`project_id`,`archived_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_business_archived_order_index` ON `tasks` (`workspace_id`,`business_id`,`archived_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_status_archived_order_index` ON `tasks` (`workspace_id`,`status_key`,`archived_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_priority_archived_order_index` ON `tasks` (`workspace_id`,`priority_key`,`archived_at`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_due_completion_archive_index` ON `tasks` (`workspace_id`,`due_date`,`completed_at`,`archived_at`,`id`);--> statement-breakpoint
CREATE INDEX `tasks_workspace_name_lower_index` ON `tasks` (`workspace_id`,lower(`name`));--> statement-breakpoint
CREATE INDEX `tasks_name_search_index` ON `tasks` (`name`);--> statement-breakpoint
CREATE INDEX `tool_models_workspace_tool_archived_updated_index` ON `tool_models` (`workspace_id`,`tool_key`,`archived_at`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `tool_models_workspace_name_lower_index` ON `tool_models` (`workspace_id`,lower(`name`));--> statement-breakpoint
CREATE INDEX `tool_responses_workspace_use_submitted_index` ON `tool_responses` (`workspace_id`,`use_id`,`submitted_at`,`id`);--> statement-breakpoint
CREATE INDEX `tool_uses_workspace_status_updated_index` ON `tool_uses` (`workspace_id`,`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `tool_uses_workspace_tool_updated_index` ON `tool_uses` (`workspace_id`,`tool_key`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `tool_uses_workspace_task_index` ON `tool_uses` (`workspace_id`,`task_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `agenda_entries_workspace_kind_date_position_index` ON `agenda_entries` (`workspace_id`,`entity_kind`,`scheduled_date`,`position`,`id`);--> statement-breakpoint
CREATE INDEX `cronograma_blocks_workspace_date_start_index` ON `cronograma_blocks` (`workspace_id`,`scheduled_date`,`start_minutes`,`id`);--> statement-breakpoint
CREATE INDEX `cronograma_blocks_workspace_task_date_index` ON `cronograma_blocks` (`workspace_id`,`task_id`,`scheduled_date`,`start_minutes`);