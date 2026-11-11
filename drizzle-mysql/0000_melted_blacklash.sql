CREATE TABLE `personal_tasks` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`title` varchar(80) NOT NULL,
	`completed` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `personal_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `personal_tasks_title_not_blank` CHECK(length(btrim(`personal_tasks`.`title`)) > 0),
	CONSTRAINT `personal_tasks_sort_order_nonnegative` CHECK(`personal_tasks`.`sort_order` >= 0)
);
--> statement-breakpoint
CREATE TABLE `user_credentials` (
	`user_id` char(36) NOT NULL,
	`password_hash` text NOT NULL,
	`password_changed_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `user_credentials_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `user_credentials_password_hash_not_blank` CHECK(length(btrim(`user_credentials`.`password_hash`)) > 0),
	CONSTRAINT `user_credentials_password_changed_not_before_creation` CHECK(`user_credentials`.`password_changed_at` >= `user_credentials`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` char(36) NOT NULL,
	`settings` json NOT NULL DEFAULT '{}'::jsonb,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `user_preferences_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `user_preferences_version_positive` CHECK(`user_preferences`.`version` > 0),
	CONSTRAINT `user_preferences_settings_object` CHECK(jsonb_typeof(`user_preferences`.`settings`) = 'object'),
	CONSTRAINT `user_preferences_updated_not_before_creation` CHECK(`user_preferences`.`updated_at` >= `user_preferences`.`created_at`)
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
	CONSTRAINT `users_username_lower_unique` UNIQUE(lower(`username`)),
	CONSTRAINT `users_name_not_blank` CHECK(length(btrim(`users`.`name`)) > 0),
	CONSTRAINT `users_username_normalized` CHECK(`users`.`username` = lower(btrim(`users`.`username`))),
	CONSTRAINT `users_username_format` CHECK(`users`.`username` ~ '^[a-z0-9._-]{3,40}$'),
	CONSTRAINT `users_email_normalized` CHECK(`users`.`email` = lower(btrim(`users`.`email`))),
	CONSTRAINT `users_email_has_at_sign` CHECK(position('@' in `users`.`email`) > 1)
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
	CONSTRAINT `auth_sessions_token_hash_unique` UNIQUE(`token_hash`),
	CONSTRAINT `auth_sessions_token_hash_hex` CHECK(`auth_sessions`.`token_hash` ~ '^[0-9a-f]{64}$'),
	CONSTRAINT `auth_sessions_expiration_after_creation` CHECK(`auth_sessions`.`expires_at` > `auth_sessions`.`created_at`),
	CONSTRAINT `auth_sessions_last_seen_not_before_creation` CHECK(`auth_sessions`.`last_seen_at` >= `auth_sessions`.`created_at`),
	CONSTRAINT `auth_sessions_revocation_not_before_creation` CHECK(`auth_sessions`.`revoked_at` is null or `auth_sessions`.`revoked_at` >= `auth_sessions`.`created_at`)
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
	CONSTRAINT `password_reset_tokens_token_hash_unique` UNIQUE(`token_hash`),
	CONSTRAINT `password_reset_tokens_token_hash_hex` CHECK(`password_reset_tokens`.`token_hash` ~ '^[0-9a-f]{64}$'),
	CONSTRAINT `password_reset_tokens_expiration_after_creation` CHECK(`password_reset_tokens`.`expires_at` > `password_reset_tokens`.`created_at`),
	CONSTRAINT `password_reset_tokens_usage_not_before_creation` CHECK(`password_reset_tokens`.`used_at` is null or `password_reset_tokens`.`used_at` >= `password_reset_tokens`.`created_at`),
	CONSTRAINT `password_reset_tokens_revocation_not_before_creation` CHECK(`password_reset_tokens`.`revoked_at` is null or `password_reset_tokens`.`revoked_at` >= `password_reset_tokens`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` char(36) NOT NULL,
	`workspace_id` char(36) NOT NULL,
	`actor_user_id` char(36),
	`action` varchar(100) NOT NULL,
	`target_type` varchar(80) NOT NULL,
	`target_id` varchar(160),
	`metadata` json NOT NULL DEFAULT '{}'::jsonb,
	`ip_address` varchar(64),
	`user_agent` varchar(512),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `audit_logs_action_not_blank` CHECK(length(btrim(`audit_logs`.`action`)) > 0),
	CONSTRAINT `audit_logs_target_type_not_blank` CHECK(length(btrim(`audit_logs`.`target_type`)) > 0),
	CONSTRAINT `audit_logs_target_id_not_blank` CHECK(`audit_logs`.`target_id` is null or length(btrim(`audit_logs`.`target_id`)) > 0),
	CONSTRAINT `audit_logs_metadata_is_object` CHECK(jsonb_typeof(`audit_logs`.`metadata`) = 'object')
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
	CONSTRAINT `connection_requests_user_pair_unique` UNIQUE(`user_a_id`,`user_b_id`),
	CONSTRAINT `connection_requests_canonical_pair` CHECK(`connection_requests`.`user_a_id` < `connection_requests`.`user_b_id`),
	CONSTRAINT `connection_requests_requester_in_pair` CHECK(`connection_requests`.`requested_by_user_id` = `connection_requests`.`user_a_id` or `connection_requests`.`requested_by_user_id` = `connection_requests`.`user_b_id`),
	CONSTRAINT `connection_requests_status_allowed` CHECK(`connection_requests`.`status` in ('pending', 'accepted', 'declined', 'cancelled')),
	CONSTRAINT `connection_requests_response_consistent` CHECK((`connection_requests`.`status` = 'pending' and `connection_requests`.`responded_at` is null) or (`connection_requests`.`status` <> 'pending' and `connection_requests`.`responded_at` is not null))
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
	CONSTRAINT `stored_files_storage_key_unique` UNIQUE(`storage_key`),
	CONSTRAINT `stored_files_purpose_allowed` CHECK(`stored_files`.`purpose` in ('profile_avatar', 'attachment')),
	CONSTRAINT `stored_files_backend_allowed` CHECK(`stored_files`.`backend` in ('local', 's3')),
	CONSTRAINT `stored_files_status_allowed` CHECK(`stored_files`.`status` in ('pending', 'processing', 'ready', 'failed', 'deleting')),
	CONSTRAINT `stored_files_original_name_not_blank` CHECK(length(btrim(`stored_files`.`original_name`)) > 0),
	CONSTRAINT `stored_files_extension_normalized` CHECK(`stored_files`.`extension` ~ '^\.[a-z0-9]{1,15}$'),
	CONSTRAINT `stored_files_mime_type_not_blank` CHECK(length(btrim(`stored_files`.`mime_type`)) > 0),
	CONSTRAINT `stored_files_byte_size_positive` CHECK(`stored_files`.`byte_size` > 0),
	CONSTRAINT `stored_files_original_byte_size_positive` CHECK(`stored_files`.`original_byte_size` is null or `stored_files`.`original_byte_size` > 0),
	CONSTRAINT `stored_files_dimensions_complete` CHECK((`stored_files`.`width` is null and `stored_files`.`height` is null) or (`stored_files`.`width` > 0 and `stored_files`.`height` > 0)),
	CONSTRAINT `stored_files_sha256_hex` CHECK(`stored_files`.`sha256` ~ '^[0-9a-f]{64}$'),
	CONSTRAINT `stored_files_deletion_not_before_creation` CHECK(`stored_files`.`deleted_at` is null or `stored_files`.`deleted_at` >= `stored_files`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `user_connections` (
	`user_a_id` char(36) NOT NULL,
	`user_b_id` char(36) NOT NULL,
	`manual_connected_at` timestamp(3),
	`workspace_connected_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `user_connections_user_pair_primary_key` PRIMARY KEY(`user_a_id`,`user_b_id`),
	CONSTRAINT `user_connections_canonical_pair` CHECK(`user_connections`.`user_a_id` < `user_connections`.`user_b_id`),
	CONSTRAINT `user_connections_has_source` CHECK(`user_connections`.`manual_connected_at` is not null or `user_connections`.`workspace_connected_at` is not null)
);
--> statement-breakpoint
CREATE TABLE `user_storage_usage` (
	`user_id` char(36) NOT NULL,
	`storage_used_bytes` bigint NOT NULL DEFAULT 0,
	`storage_reserved_bytes` bigint NOT NULL DEFAULT 0,
	`storage_limit_bytes` bigint,
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `user_storage_usage_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `user_storage_usage_used_non_negative` CHECK(`user_storage_usage`.`storage_used_bytes` >= 0),
	CONSTRAINT `user_storage_usage_reserved_non_negative` CHECK(`user_storage_usage`.`storage_reserved_bytes` >= 0),
	CONSTRAINT `user_storage_usage_limit_positive` CHECK(`user_storage_usage`.`storage_limit_bytes` is null or `user_storage_usage`.`storage_limit_bytes` > 0),
	CONSTRAINT `user_storage_usage_within_limit` CHECK(`user_storage_usage`.`storage_limit_bytes` is null or `user_storage_usage`.`storage_used_bytes` + `user_storage_usage`.`storage_reserved_bytes` <= `user_storage_usage`.`storage_limit_bytes`)
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
	CONSTRAINT `workspace_catalog_entries_workspace_kind_key_unique` UNIQUE(`workspace_id`,`kind`,`key`),
	CONSTRAINT `workspace_catalog_entries_kind_allowed` CHECK(`workspace_catalog_entries`.`kind` in ('person_status', 'business_status', 'project_status', 'task_status', 'business_category', 'task_category', 'task_priority', 'revenue_category', 'expense_category')),
	CONSTRAINT `workspace_catalog_entries_key_normalized` CHECK(`workspace_catalog_entries`.`key` = lower(btrim(`workspace_catalog_entries`.`key`))),
	CONSTRAINT `workspace_catalog_entries_key_format` CHECK(`workspace_catalog_entries`.`key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `workspace_catalog_entries_label_not_blank` CHECK(length(btrim(`workspace_catalog_entries`.`label`)) > 0),
	CONSTRAINT `workspace_catalog_entries_sort_order_non_negative` CHECK(`workspace_catalog_entries`.`sort_order` >= 0),
	CONSTRAINT `workspace_catalog_entries_version_positive` CHECK(`workspace_catalog_entries`.`version` > 0),
	CONSTRAINT `workspace_catalog_entries_updated_not_before_creation` CHECK(`workspace_catalog_entries`.`updated_at` >= `workspace_catalog_entries`.`created_at`),
	CONSTRAINT `workspace_catalog_entries_archive_not_before_creation` CHECK(`workspace_catalog_entries`.`archived_at` is null or `workspace_catalog_entries`.`archived_at` >= `workspace_catalog_entries`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `workspace_configurations` (
	`workspace_id` char(36) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`template_gallery_version` int NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_configurations_workspace_id` PRIMARY KEY(`workspace_id`),
	CONSTRAINT `workspace_configurations_version_positive` CHECK(`workspace_configurations`.`version` > 0),
	CONSTRAINT `workspace_configurations_gallery_version_positive` CHECK(`workspace_configurations`.`template_gallery_version` > 0),
	CONSTRAINT `workspace_configurations_updated_not_before_creation` CHECK(`workspace_configurations`.`updated_at` >= `workspace_configurations`.`created_at`)
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
	CONSTRAINT `workspace_invitations_pending_email_unique` UNIQUE(`workspace_id`,lower(`email`)),
	CONSTRAINT `workspace_invitations_email_normalized` CHECK(`workspace_invitations`.`email` = lower(btrim(`workspace_invitations`.`email`))),
	CONSTRAINT `workspace_invitations_email_has_at_sign` CHECK(position('@' in `workspace_invitations`.`email`) > 1),
	CONSTRAINT `workspace_invitations_role_allowed` CHECK(`workspace_invitations`.`role` in ('admin', 'member')),
	CONSTRAINT `workspace_invitations_status_allowed` CHECK(`workspace_invitations`.`status` in ('pending', 'accepted', 'revoked')),
	CONSTRAINT `workspace_invitations_acceptance_consistent` CHECK((`workspace_invitations`.`status` = 'accepted') = (`workspace_invitations`.`accepted_at` is not null and `workspace_invitations`.`accepted_by_user_id` is not null))
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`role` varchar(16) NOT NULL DEFAULT 'member',
	`joined_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `workspace_members_workspace_user_primary_key` PRIMARY KEY(`workspace_id`,`user_id`),
	CONSTRAINT `workspace_members_one_owner_unique` UNIQUE(`workspace_id`),
	CONSTRAINT `workspace_members_role_allowed` CHECK(`workspace_members`.`role` in ('owner', 'admin', 'member'))
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
	CONSTRAINT `workspaces_personal_owner_unique` UNIQUE(`owner_user_id`),
	CONSTRAINT `workspaces_name_not_blank` CHECK(length(btrim(`workspaces`.`name`)) > 0),
	CONSTRAINT `workspaces_kind_allowed` CHECK(`workspaces`.`kind` in ('personal', 'shared')),
	CONSTRAINT `workspaces_personal_not_archived` CHECK(`workspaces`.`kind` <> 'personal' or `workspaces`.`archived_at` is null)
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
	CONSTRAINT `communities_link_name_unique` UNIQUE(`link_name`),
	CONSTRAINT `communities_link_name_normalized` CHECK(`communities`.`link_name` = lower(btrim(`communities`.`link_name`))),
	CONSTRAINT `communities_link_name_format` CHECK(`communities`.`link_name` ~ '^[a-z0-9._-]{3,40}$'),
	CONSTRAINT `communities_name_not_blank` CHECK(length(btrim(`communities`.`name`)) > 0),
	CONSTRAINT `communities_description_not_blank` CHECK(length(btrim(`communities`.`description`)) > 0),
	CONSTRAINT `communities_topic_not_blank` CHECK(length(btrim(`communities`.`topic`)) > 0),
	CONSTRAINT `communities_visibility_allowed` CHECK(`communities`.`visibility` in ('public', 'private'))
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
	CONSTRAINT `community_invitations_community_user_unique` UNIQUE(`community_id`,`invited_user_id`),
	CONSTRAINT `community_invitations_status_allowed` CHECK(`community_invitations`.`status` in ('pending', 'accepted'))
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
	CONSTRAINT `community_join_requests_community_user_unique` UNIQUE(`community_id`,`user_id`),
	CONSTRAINT `community_join_requests_status_allowed` CHECK(`community_join_requests`.`status` in ('pending', 'accepted', 'declined'))
);
--> statement-breakpoint
CREATE TABLE `community_members` (
	`community_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`role` varchar(16) NOT NULL DEFAULT 'member',
	`joined_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `community_members_community_id_user_id_pk` PRIMARY KEY(`community_id`,`user_id`),
	CONSTRAINT `community_members_role_allowed` CHECK(`community_members`.`role` in ('owner', 'admin', 'member'))
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
	CONSTRAINT `social_post_blocks_post_position_unique` UNIQUE(`post_id`,`position`),
	CONSTRAINT `social_post_blocks_kind_allowed` CHECK(`social_post_blocks`.`kind` in ('text', 'image', 'video')),
	CONSTRAINT `social_post_blocks_position_non_negative` CHECK(`social_post_blocks`.`position` >= 0),
	CONSTRAINT `social_post_blocks_content_consistent` CHECK((`social_post_blocks`.`kind` = 'text' and nullif(btrim(coalesce(`social_post_blocks`.`text_content`, '')), '') is not null and `social_post_blocks`.`file_id` is null)
        or (`social_post_blocks`.`kind` in ('image', 'video') and `social_post_blocks`.`file_id` is not null and `social_post_blocks`.`text_content` is null))
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
	CONSTRAINT `social_post_comments_id` PRIMARY KEY(`id`),
	CONSTRAINT `social_post_comments_body_not_blank` CHECK(nullif(btrim(`social_post_comments`.`body`), '') is not null),
	CONSTRAINT `social_post_comments_depth_allowed` CHECK(`social_post_comments`.`depth` between 0 and 10)
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
	CONSTRAINT `social_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `social_posts_kind_allowed` CHECK(`social_posts`.`kind` in ('feed', 'portfolio')),
	CONSTRAINT `social_posts_portfolio_has_title` CHECK(`social_posts`.`kind` <> 'portfolio' or nullif(btrim(coalesce(`social_posts`.`title`, '')), '') is not null)
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
	CONSTRAINT `business_notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_notes_body_not_blank` CHECK(length(btrim(`business_notes`.`body`)) > 0),
	CONSTRAINT `business_notes_sort_order_non_negative` CHECK(`business_notes`.`sort_order` >= 0),
	CONSTRAINT `business_notes_updated_not_before_creation` CHECK(`business_notes`.`updated_at` >= `business_notes`.`created_at`),
	CONSTRAINT `business_notes_archive_not_before_creation` CHECK(`business_notes`.`archived_at` is null or `business_notes`.`archived_at` >= `business_notes`.`created_at`)
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
	CONSTRAINT `business_responsibles_business_user_unique` UNIQUE(`workspace_id`,`business_id`,`user_id`),
	CONSTRAINT `business_responsibles_exactly_one_subject` CHECK(num_nonnulls(`business_responsibles`.`contact_id`, `business_responsibles`.`user_id`) = 1),
	CONSTRAINT `business_responsibles_sort_order_non_negative` CHECK(`business_responsibles`.`sort_order` is null or `business_responsibles`.`sort_order` >= 0)
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
	CONSTRAINT `businesses_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `businesses_name_not_blank` CHECK(length(btrim(`businesses`.`name`)) > 0),
	CONSTRAINT `businesses_category_key_normalized` CHECK(`businesses`.`category_key` = lower(btrim(`businesses`.`category_key`))),
	CONSTRAINT `businesses_category_key_format` CHECK(`businesses`.`category_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `businesses_stage_key_normalized` CHECK(`businesses`.`stage_key` = lower(btrim(`businesses`.`stage_key`))),
	CONSTRAINT `businesses_stage_key_format` CHECK(`businesses`.`stage_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `businesses_updated_not_before_creation` CHECK(`businesses`.`updated_at` >= `businesses`.`created_at`),
	CONSTRAINT `businesses_archive_not_before_creation` CHECK(`businesses`.`archived_at` is null or `businesses`.`archived_at` >= `businesses`.`created_at`)
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
	CONSTRAINT `contact_emails_one_primary_unique` UNIQUE(`workspace_id`,`contact_id`),
	CONSTRAINT `contact_emails_type_allowed` CHECK(`contact_emails`.`type` in ('personal', 'work', 'other')),
	CONSTRAINT `contact_emails_address_normalized` CHECK(`contact_emails`.`address` = lower(btrim(`contact_emails`.`address`))),
	CONSTRAINT `contact_emails_address_format` CHECK(`contact_emails`.`address` ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
	CONSTRAINT `contact_emails_label_not_blank` CHECK(`contact_emails`.`label` is null or length(btrim(`contact_emails`.`label`)) > 0),
	CONSTRAINT `contact_emails_updated_not_before_creation` CHECK(`contact_emails`.`updated_at` >= `contact_emails`.`created_at`)
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
	CONSTRAINT `contact_notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_notes_body_not_blank` CHECK(length(btrim(`contact_notes`.`body`)) > 0),
	CONSTRAINT `contact_notes_updated_not_before_creation` CHECK(`contact_notes`.`updated_at` >= `contact_notes`.`created_at`),
	CONSTRAINT `contact_notes_archive_not_before_creation` CHECK(`contact_notes`.`archived_at` is null or `contact_notes`.`archived_at` >= `contact_notes`.`created_at`)
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
	CONSTRAINT `contact_phones_one_primary_unique` UNIQUE(`workspace_id`,`contact_id`),
	CONSTRAINT `contact_phones_type_allowed` CHECK(`contact_phones`.`type` in ('mobile', 'whatsapp', 'work', 'home', 'other')),
	CONSTRAINT `contact_phones_number_e164` CHECK(`contact_phones`.`number` ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT `contact_phones_label_not_blank` CHECK(`contact_phones`.`label` is null or length(btrim(`contact_phones`.`label`)) > 0),
	CONSTRAINT `contact_phones_updated_not_before_creation` CHECK(`contact_phones`.`updated_at` >= `contact_phones`.`created_at`)
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
	CONSTRAINT `contacts_owner_linked_user_unique` UNIQUE(`owner_user_id`,`linked_user_id`),
	CONSTRAINT `contacts_type_allowed` CHECK(`contacts`.`contact_type` in ('person', 'company', 'other')),
	CONSTRAINT `contacts_status_allowed` CHECK(`contacts`.`status` in ('lead', 'prospect', 'active', 'inactive')),
	CONSTRAINT `contacts_profession_not_blank` CHECK(`contacts`.`profession` is null or length(btrim(`contacts`.`profession`)) > 0),
	CONSTRAINT `contacts_updated_not_before_creation` CHECK(`contacts`.`updated_at` >= `contacts`.`created_at`),
	CONSTRAINT `contacts_archive_not_before_creation` CHECK(`contacts`.`archived_at` is null or `contacts`.`archived_at` >= `contacts`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `delivery_template_responsibles` (
	`workspace_id` char(36) NOT NULL,
	`delivery_template_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `delivery_template_responsibles_workspace_template_user_primary_key` PRIMARY KEY(`workspace_id`,`delivery_template_id`,`user_id`),
	CONSTRAINT `delivery_template_responsibles_sort_order_non_negative` CHECK(`delivery_template_responsibles`.`sort_order` >= 0)
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
	CONSTRAINT `delivery_template_subtasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `delivery_template_subtasks_name_not_blank` CHECK(length(btrim(`delivery_template_subtasks`.`name`)) > 0),
	CONSTRAINT `delivery_template_subtasks_duration_range` CHECK(`delivery_template_subtasks`.`duration_minutes` between 30 and 10080),
	CONSTRAINT `delivery_template_subtasks_duration_half_hour` CHECK(`delivery_template_subtasks`.`duration_minutes` % 30 = 0),
	CONSTRAINT `delivery_template_subtasks_status_normalized` CHECK(`delivery_template_subtasks`.`default_status_key` = lower(btrim(`delivery_template_subtasks`.`default_status_key`))),
	CONSTRAINT `delivery_template_subtasks_status_format` CHECK(`delivery_template_subtasks`.`default_status_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `delivery_template_subtasks_sort_order_non_negative` CHECK(`delivery_template_subtasks`.`sort_order` >= 0),
	CONSTRAINT `delivery_template_subtasks_updated_not_before_creation` CHECK(`delivery_template_subtasks`.`updated_at` >= `delivery_template_subtasks`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `delivery_template_tags` (
	`workspace_id` char(36) NOT NULL,
	`delivery_template_id` char(36) NOT NULL,
	`tag_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `delivery_template_tags_workspace_template_tag_primary_key` PRIMARY KEY(`workspace_id`,`delivery_template_id`,`tag_id`),
	CONSTRAINT `delivery_template_tags_sort_order_non_negative` CHECK(`delivery_template_tags`.`sort_order` >= 0)
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
	CONSTRAINT `delivery_templates_workspace_active_name_unique` UNIQUE(`workspace_id`,lower(`name`)),
	CONSTRAINT `delivery_templates_name_not_blank` CHECK(length(btrim(`delivery_templates`.`name`)) > 0),
	CONSTRAINT `delivery_templates_category_normalized` CHECK(`delivery_templates`.`category_key` is null or `delivery_templates`.`category_key` = lower(btrim(`delivery_templates`.`category_key`))),
	CONSTRAINT `delivery_templates_category_format` CHECK(`delivery_templates`.`category_key` is null or `delivery_templates`.`category_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `delivery_templates_status_normalized` CHECK(`delivery_templates`.`default_status_key` = lower(btrim(`delivery_templates`.`default_status_key`))),
	CONSTRAINT `delivery_templates_status_format` CHECK(`delivery_templates`.`default_status_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `delivery_templates_status_not_archived` CHECK(`delivery_templates`.`default_status_key` <> 'arquivado'),
	CONSTRAINT `delivery_templates_priority_normalized` CHECK(`delivery_templates`.`default_priority_key` = lower(btrim(`delivery_templates`.`default_priority_key`))),
	CONSTRAINT `delivery_templates_priority_format` CHECK(`delivery_templates`.`default_priority_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `delivery_templates_duration_range` CHECK(`delivery_templates`.`default_duration_minutes` is null or `delivery_templates`.`default_duration_minutes` between 30 and 10080),
	CONSTRAINT `delivery_templates_duration_half_hour` CHECK(`delivery_templates`.`default_duration_minutes` is null or `delivery_templates`.`default_duration_minutes` % 30 = 0),
	CONSTRAINT `delivery_templates_sort_order_non_negative` CHECK(`delivery_templates`.`sort_order` >= 0),
	CONSTRAINT `delivery_templates_version_positive` CHECK(`delivery_templates`.`version` > 0),
	CONSTRAINT `delivery_templates_updated_not_before_creation` CHECK(`delivery_templates`.`updated_at` >= `delivery_templates`.`created_at`),
	CONSTRAINT `delivery_templates_archive_not_before_creation` CHECK(`delivery_templates`.`archived_at` is null or `delivery_templates`.`archived_at` >= `delivery_templates`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `service_responsibles` (
	`workspace_id` char(36) NOT NULL,
	`service_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `service_responsibles_workspace_service_user_primary_key` PRIMARY KEY(`workspace_id`,`service_id`,`user_id`),
	CONSTRAINT `service_responsibles_sort_order_non_negative` CHECK(`service_responsibles`.`sort_order` >= 0)
);
--> statement-breakpoint
CREATE TABLE `service_tags` (
	`workspace_id` char(36) NOT NULL,
	`service_id` char(36) NOT NULL,
	`tag_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `service_tags_workspace_service_tag_primary_key` PRIMARY KEY(`workspace_id`,`service_id`,`tag_id`),
	CONSTRAINT `service_tags_sort_order_non_negative` CHECK(`service_tags`.`sort_order` >= 0)
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
	CONSTRAINT `service_task_templates_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `service_task_templates_name_not_blank` CHECK(length(btrim(`service_task_templates`.`name`)) > 0),
	CONSTRAINT `service_task_templates_sort_order_non_negative` CHECK(`service_task_templates`.`sort_order` >= 0),
	CONSTRAINT `service_task_templates_updated_not_before_creation` CHECK(`service_task_templates`.`updated_at` >= `service_task_templates`.`created_at`)
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
	CONSTRAINT `services_workspace_active_name_unique` UNIQUE(`workspace_id`,lower(`name`)),
	CONSTRAINT `services_name_not_blank` CHECK(length(btrim(`services`.`name`)) > 0),
	CONSTRAINT `services_default_status_normalized` CHECK(`services`.`default_status_key` = lower(btrim(`services`.`default_status_key`))),
	CONSTRAINT `services_default_status_format` CHECK(`services`.`default_status_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `services_default_status_not_archived` CHECK(`services`.`default_status_key` <> 'arquivado'),
	CONSTRAINT `services_default_duration_range` CHECK(`services`.`default_duration_days` is null or `services`.`default_duration_days` between 1 and 3650),
	CONSTRAINT `services_default_contract_allowed` CHECK(`services`.`default_contract_type` in ('one_off', 'recurring')),
	CONSTRAINT `services_default_amount_safe` CHECK(`services`.`default_amount_cents` is null or `services`.`default_amount_cents` between 0 and 9007199254740991),
	CONSTRAINT `services_default_installment_count_range` CHECK(`services`.`default_installment_count` between 1 and 99),
	CONSTRAINT `services_sort_order_non_negative` CHECK(`services`.`sort_order` >= 0),
	CONSTRAINT `services_version_positive` CHECK(`services`.`version` > 0),
	CONSTRAINT `services_payment_method_not_blank` CHECK(`services`.`default_payment_method` is null or length(btrim(`services`.`default_payment_method`)) > 0),
	CONSTRAINT `services_updated_not_before_creation` CHECK(`services`.`updated_at` >= `services`.`created_at`),
	CONSTRAINT `services_archive_not_before_creation` CHECK(`services`.`archived_at` is null or `services`.`archived_at` >= `services`.`created_at`)
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
	CONSTRAINT `tags_workspace_key_unique` UNIQUE(`workspace_id`,`key`),
	CONSTRAINT `tags_label_not_blank` CHECK(length(btrim(`tags`.`label`)) > 0),
	CONSTRAINT `tags_key_normalized` CHECK(`tags`.`key` = lower(btrim(`tags`.`key`))),
	CONSTRAINT `tags_key_format` CHECK(`tags`.`key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `tags_sort_order_non_negative` CHECK(`tags`.`sort_order` >= 0),
	CONSTRAINT `tags_version_positive` CHECK(`tags`.`version` > 0),
	CONSTRAINT `tags_updated_not_before_creation` CHECK(`tags`.`updated_at` >= `tags`.`created_at`),
	CONSTRAINT `tags_archive_not_before_creation` CHECK(`tags`.`archived_at` is null or `tags`.`archived_at` >= `tags`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `project_responsibles` (
	`workspace_id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `project_responsibles_workspace_project_user_primary_key` PRIMARY KEY(`workspace_id`,`project_id`,`user_id`),
	CONSTRAINT `project_responsibles_sort_order_non_negative` CHECK(`project_responsibles`.`sort_order` >= 0)
);
--> statement-breakpoint
CREATE TABLE `project_services` (
	`workspace_id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`service_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `project_services_workspace_project_service_primary_key` PRIMARY KEY(`workspace_id`,`project_id`,`service_id`),
	CONSTRAINT `project_services_sort_order_non_negative` CHECK(`project_services`.`sort_order` >= 0)
);
--> statement-breakpoint
CREATE TABLE `project_tags` (
	`workspace_id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`tag_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `project_tags_workspace_project_tag_primary_key` PRIMARY KEY(`workspace_id`,`project_id`,`tag_id`),
	CONSTRAINT `project_tags_sort_order_non_negative` CHECK(`project_tags`.`sort_order` >= 0)
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
	CONSTRAINT `projects_workspace_business_institutional_unique` UNIQUE(`workspace_id`,`business_id`),
	CONSTRAINT `projects_name_not_blank` CHECK(length(btrim(`projects`.`name`)) > 0),
	CONSTRAINT `projects_status_key_normalized` CHECK(`projects`.`status_key` = lower(btrim(`projects`.`status_key`))),
	CONSTRAINT `projects_status_key_format` CHECK(`projects`.`status_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `projects_status_not_archived` CHECK(`projects`.`status_key` <> 'arquivado'),
	CONSTRAINT `projects_contract_type_allowed` CHECK(`projects`.`contract_type` in ('one_off', 'recurring')),
	CONSTRAINT `projects_amount_cents_safe` CHECK(`projects`.`amount_cents` is null or `projects`.`amount_cents` between 0 and 9007199254740991),
	CONSTRAINT `projects_dates_ordered` CHECK(`projects`.`start_date` is null or `projects`.`end_date` is null or `projects`.`end_date` >= `projects`.`start_date`),
	CONSTRAINT `projects_payment_method_not_blank` CHECK(`projects`.`payment_method` is null or length(btrim(`projects`.`payment_method`)) > 0),
	CONSTRAINT `projects_updated_not_before_creation` CHECK(`projects`.`updated_at` >= `projects`.`created_at`),
	CONSTRAINT `projects_archive_not_before_creation` CHECK(`projects`.`archived_at` is null or `projects`.`archived_at` >= `projects`.`created_at`),
	CONSTRAINT `projects_institutional_not_archived` CHECK(not `projects`.`is_institutional` or `projects`.`archived_at` is null)
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
	CONSTRAINT `financial_entries_workspace_project_installment_unique` UNIQUE(`workspace_id`,`project_installment_id`),
	CONSTRAINT `financial_entries_source_allowed` CHECK(`financial_entries`.`source` in ('manual', 'project')),
	CONSTRAINT `financial_entries_source_consistent` CHECK((`financial_entries`.`source` = 'manual' and `financial_entries`.`project_id` is null and `financial_entries`.`project_installment_id` is null)
        or (`financial_entries`.`source` = 'project' and `financial_entries`.`project_id` is not null and `financial_entries`.`project_installment_id` is not null)),
	CONSTRAINT `financial_entries_type_allowed` CHECK(`financial_entries`.`type` in ('revenue', 'expense')),
	CONSTRAINT `financial_entries_mode_allowed` CHECK(`financial_entries`.`mode` in ('one_off', 'recurring')),
	CONSTRAINT `financial_entries_title_not_blank` CHECK(length(btrim(`financial_entries`.`title`)) > 0),
	CONSTRAINT `financial_entries_amount_positive` CHECK(`financial_entries`.`amount` > 0 and `financial_entries`.`amount` <= 9999999999999999.99),
	CONSTRAINT `financial_entries_status_allowed` CHECK(`financial_entries`.`status` in ('open', 'paused', 'settled')),
	CONSTRAINT `financial_entries_settlement_consistent` CHECK((`financial_entries`.`status` = 'settled') = (`financial_entries`.`settled_at` is not null)),
	CONSTRAINT `financial_entries_series_consistent` CHECK((`financial_entries`.`series_kind` is null and `financial_entries`.`series_id` is null and `financial_entries`.`series_number` is null and `financial_entries`.`series_count` is null)
        or (`financial_entries`.`series_kind` in ('installment', 'recurrence') and `financial_entries`.`series_id` is not null and `financial_entries`.`series_number` between 1 and 999 and `financial_entries`.`series_count` between 1 and 999 and `financial_entries`.`series_number` <= `financial_entries`.`series_count`)),
	CONSTRAINT `financial_entries_version_positive` CHECK(`financial_entries`.`version` > 0),
	CONSTRAINT `financial_entries_updated_not_before_creation` CHECK(`financial_entries`.`updated_at` >= `financial_entries`.`created_at`),
	CONSTRAINT `financial_entries_deleted_not_before_creation` CHECK(`financial_entries`.`deleted_at` is null or `financial_entries`.`deleted_at` >= `financial_entries`.`created_at`)
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
	CONSTRAINT `project_installments_project_number_unique` UNIQUE(`workspace_id`,`project_id`,`number`),
	CONSTRAINT `project_installments_number_range` CHECK(`project_installments`.`number` between 1 and 999),
	CONSTRAINT `project_installments_amount_safe` CHECK(`project_installments`.`amount_cents` between 0 and 9007199254740991),
	CONSTRAINT `project_installments_status_normalized` CHECK(`project_installments`.`status_key` is null or `project_installments`.`status_key` = lower(btrim(`project_installments`.`status_key`))),
	CONSTRAINT `project_installments_status_format` CHECK(`project_installments`.`status_key` is null or `project_installments`.`status_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `project_installments_updated_not_before_creation` CHECK(`project_installments`.`updated_at` >= `project_installments`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `task_responsibles` (
	`workspace_id` char(36) NOT NULL,
	`task_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `task_responsibles_workspace_task_user_primary_key` PRIMARY KEY(`workspace_id`,`task_id`,`user_id`),
	CONSTRAINT `task_responsibles_workspace_task_unique` UNIQUE(`workspace_id`,`task_id`),
	CONSTRAINT `task_responsibles_sort_order_non_negative` CHECK(`task_responsibles`.`sort_order` >= 0)
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
	CONSTRAINT `task_subtasks_workspace_id_task_unique` UNIQUE(`workspace_id`,`id`,`task_id`),
	CONSTRAINT `task_subtasks_name_not_blank` CHECK(length(btrim(`task_subtasks`.`name`)) > 0),
	CONSTRAINT `task_subtasks_duration_range` CHECK(`task_subtasks`.`duration_minutes` between 30 and 10080),
	CONSTRAINT `task_subtasks_duration_half_hour` CHECK(`task_subtasks`.`duration_minutes` % 30 = 0),
	CONSTRAINT `task_subtasks_status_normalized` CHECK(`task_subtasks`.`status_key` = lower(btrim(`task_subtasks`.`status_key`))),
	CONSTRAINT `task_subtasks_status_format` CHECK(`task_subtasks`.`status_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `task_subtasks_status_not_archived` CHECK(`task_subtasks`.`status_key` <> 'arquivado'),
	CONSTRAINT `task_subtasks_completion_status_consistent` CHECK((`task_subtasks`.`status_key` = 'concluida') = (`task_subtasks`.`completed_at` is not null)),
	CONSTRAINT `task_subtasks_sort_order_non_negative` CHECK(`task_subtasks`.`sort_order` >= 0),
	CONSTRAINT `task_subtasks_updated_not_before_creation` CHECK(`task_subtasks`.`updated_at` >= `task_subtasks`.`created_at`),
	CONSTRAINT `task_subtasks_completion_not_before_creation` CHECK(`task_subtasks`.`completed_at` is null or `task_subtasks`.`completed_at` >= `task_subtasks`.`created_at`),
	CONSTRAINT `task_subtasks_archive_not_before_creation` CHECK(`task_subtasks`.`archived_at` is null or `task_subtasks`.`archived_at` >= `task_subtasks`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `task_tags` (
	`workspace_id` char(36) NOT NULL,
	`task_id` char(36) NOT NULL,
	`tag_id` char(36) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `task_tags_workspace_task_tag_primary_key` PRIMARY KEY(`workspace_id`,`task_id`,`tag_id`),
	CONSTRAINT `task_tags_sort_order_non_negative` CHECK(`task_tags`.`sort_order` >= 0)
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
	`board_order` json NOT NULL DEFAULT '{}'::jsonb,
	`version` int NOT NULL DEFAULT 1,
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`archived_at` timestamp(3),
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `tasks_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `tasks_name_not_blank` CHECK(length(btrim(`tasks`.`name`)) > 0),
	CONSTRAINT `tasks_category_normalized` CHECK(`tasks`.`category_key` is null or `tasks`.`category_key` = lower(btrim(`tasks`.`category_key`))),
	CONSTRAINT `tasks_category_format` CHECK(`tasks`.`category_key` is null or `tasks`.`category_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `tasks_priority_normalized` CHECK(`tasks`.`priority_key` = lower(btrim(`tasks`.`priority_key`))),
	CONSTRAINT `tasks_priority_format` CHECK(`tasks`.`priority_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `tasks_status_normalized` CHECK(`tasks`.`status_key` = lower(btrim(`tasks`.`status_key`))),
	CONSTRAINT `tasks_status_format` CHECK(`tasks`.`status_key` ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT `tasks_status_not_archived` CHECK(`tasks`.`status_key` <> 'arquivado'),
	CONSTRAINT `tasks_completion_status_consistent` CHECK((`tasks`.`status_key` = 'conclusao') = (`tasks`.`completed_at` is not null)),
	CONSTRAINT `tasks_sort_order_non_negative` CHECK(`tasks`.`sort_order` >= 0),
	CONSTRAINT `tasks_version_positive` CHECK(`tasks`.`version` > 0),
	CONSTRAINT `tasks_board_order_shape` CHECK(jsonb_typeof(`tasks`.`board_order`) = 'object'
        and `tasks`.`board_order` - 'status' - 'priority' - 'business' - 'project' = '{}'::jsonb
        and (not (`tasks`.`board_order` ? 'status') or
          (jsonb_typeof(`tasks`.`board_order`->'status') = 'number' and
           `tasks`.`board_order`->>'status' ~ '^[0-9]{1,9}$'))
        and (not (`tasks`.`board_order` ? 'priority') or
          (jsonb_typeof(`tasks`.`board_order`->'priority') = 'number' and
           `tasks`.`board_order`->>'priority' ~ '^[0-9]{1,9}$'))
        and (not (`tasks`.`board_order` ? 'business') or
          (jsonb_typeof(`tasks`.`board_order`->'business') = 'number' and
           `tasks`.`board_order`->>'business' ~ '^[0-9]{1,9}$'))
        and (not (`tasks`.`board_order` ? 'project') or
          (jsonb_typeof(`tasks`.`board_order`->'project') = 'number' and
           `tasks`.`board_order`->>'project' ~ '^[0-9]{1,9}$'))),
	CONSTRAINT `tasks_updated_not_before_creation` CHECK(`tasks`.`updated_at` >= `tasks`.`created_at`),
	CONSTRAINT `tasks_completion_not_before_creation` CHECK(`tasks`.`completed_at` is null or `tasks`.`completed_at` >= `tasks`.`created_at`),
	CONSTRAINT `tasks_archive_not_before_creation` CHECK(`tasks`.`archived_at` is null or `tasks`.`archived_at` >= `tasks`.`created_at`)
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
	CONSTRAINT `tool_models_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `tool_models_tool_key_allowed` CHECK(`tool_models`.`tool_key` in ('form', 'evaluation', 'comparison', 'intensity')),
	CONSTRAINT `tool_models_name_not_blank` CHECK(length(btrim(`tool_models`.`name`)) > 0),
	CONSTRAINT `tool_models_config_object` CHECK(jsonb_typeof(`tool_models`.`config`) = 'object'),
	CONSTRAINT `tool_models_version_positive` CHECK(`tool_models`.`version` > 0),
	CONSTRAINT `tool_models_updated_not_before_creation` CHECK(`tool_models`.`updated_at` >= `tool_models`.`created_at`),
	CONSTRAINT `tool_models_archive_not_before_creation` CHECK(`tool_models`.`archived_at` is null or `tool_models`.`archived_at` >= `tool_models`.`created_at`)
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
	CONSTRAINT `tool_responses_workspace_use_respondent_unique` UNIQUE(`workspace_id`,`use_id`,`respondent_user_id`),
	CONSTRAINT `tool_responses_payload_object` CHECK(jsonb_typeof(`tool_responses`.`payload`) = 'object'),
	CONSTRAINT `tool_responses_submission_not_before_creation` CHECK(`tool_responses`.`submitted_at` >= `tool_responses`.`created_at`)
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
	CONSTRAINT `tool_uses_workspace_id_id_unique` UNIQUE(`workspace_id`,`id`),
	CONSTRAINT `tool_uses_tool_key_allowed` CHECK(`tool_uses`.`tool_key` in ('form', 'evaluation', 'comparison', 'intensity')),
	CONSTRAINT `tool_uses_status_allowed` CHECK(`tool_uses`.`status` in ('draft', 'open', 'completed', 'archived')),
	CONSTRAINT `tool_uses_name_not_blank` CHECK(length(btrim(`tool_uses`.`name`)) > 0),
	CONSTRAINT `tool_uses_json_objects` CHECK(jsonb_typeof(`tool_uses`.`config_snapshot`) = 'object' and jsonb_typeof(`tool_uses`.`content`) = 'object'),
	CONSTRAINT `tool_uses_version_positive` CHECK(`tool_uses`.`version` > 0),
	CONSTRAINT `tool_uses_completion_consistent` CHECK((`tool_uses`.`status` = 'completed' and `tool_uses`.`completed_at` is not null)
        or (`tool_uses`.`status` in ('draft', 'open') and `tool_uses`.`completed_at` is null)
        or `tool_uses`.`status` = 'archived'),
	CONSTRAINT `tool_uses_archive_consistent` CHECK((`tool_uses`.`status` = 'archived') = (`tool_uses`.`archived_at` is not null)),
	CONSTRAINT `tool_uses_updated_not_before_creation` CHECK(`tool_uses`.`updated_at` >= `tool_uses`.`created_at`)
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
	CONSTRAINT `agenda_entries_workspace_kind_date_position_unique` UNIQUE(`workspace_id`,`entity_kind`,`scheduled_date`,`position`),
	CONSTRAINT `agenda_entries_entity_kind_allowed` CHECK(`agenda_entries`.`entity_kind` in ('project', 'task')),
	CONSTRAINT `agenda_entries_entity_consistent` CHECK((`agenda_entries`.`entity_kind` = 'project' and `agenda_entries`.`project_id` is not null and `agenda_entries`.`task_id` is null)
        or (`agenda_entries`.`entity_kind` = 'task' and `agenda_entries`.`task_id` is not null and `agenda_entries`.`project_id` is null)),
	CONSTRAINT `agenda_entries_position_non_negative` CHECK(`agenda_entries`.`position` >= 0),
	CONSTRAINT `agenda_entries_duration_range` CHECK(`agenda_entries`.`duration_minutes` between 30 and 10080),
	CONSTRAINT `agenda_entries_duration_half_hour` CHECK(`agenda_entries`.`duration_minutes` % 30 = 0),
	CONSTRAINT `agenda_entries_version_positive` CHECK(`agenda_entries`.`version` > 0),
	CONSTRAINT `agenda_entries_updated_not_before_creation` CHECK(`agenda_entries`.`updated_at` >= `agenda_entries`.`created_at`)
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
	CONSTRAINT `cronograma_blocks_workspace_subtask_unique` UNIQUE(`workspace_id`,`subtask_id`),
	CONSTRAINT `cronograma_blocks_start_half_hour` CHECK(`cronograma_blocks`.`start_minutes` between 0 and 1410 and `cronograma_blocks`.`start_minutes` % 30 = 0),
	CONSTRAINT `cronograma_blocks_duration_range` CHECK(`cronograma_blocks`.`duration_minutes` between 30 and 480),
	CONSTRAINT `cronograma_blocks_duration_half_hour` CHECK(`cronograma_blocks`.`duration_minutes` % 30 = 0),
	CONSTRAINT `cronograma_blocks_end_within_day` CHECK(`cronograma_blocks`.`start_minutes` + `cronograma_blocks`.`duration_minutes` <= 1440),
	CONSTRAINT `cronograma_blocks_version_positive` CHECK(`cronograma_blocks`.`version` > 0),
	CONSTRAINT `cronograma_blocks_updated_not_before_creation` CHECK(`cronograma_blocks`.`updated_at` >= `cronograma_blocks`.`created_at`)
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