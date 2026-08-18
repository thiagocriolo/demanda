CREATE INDEX "businesses_name_search_index" ON "app"."businesses" USING gin (to_tsvector('simple', lower("name")));--> statement-breakpoint
CREATE INDEX "contacts_name_search_index" ON "app"."contacts" USING gin (to_tsvector('simple', lower("name")));--> statement-breakpoint
CREATE INDEX "projects_name_search_index" ON "app"."projects" USING gin (to_tsvector('simple', lower("name")));--> statement-breakpoint
CREATE INDEX "projects_workspace_end_status_archive_index" ON "app"."projects" USING btree ("workspace_id","end_date","status_key","archived_at");--> statement-breakpoint
CREATE INDEX "tasks_name_search_index" ON "app"."tasks" USING gin (to_tsvector('simple', lower("name")));