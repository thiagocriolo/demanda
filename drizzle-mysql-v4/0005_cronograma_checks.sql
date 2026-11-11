ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_start_half_hour` CHECK (`start_minutes` BETWEEN 0 AND 1410 AND `start_minutes` % 30 = 0);--> statement-breakpoint
ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_duration_range` CHECK (`duration_minutes` BETWEEN 30 AND 480);--> statement-breakpoint
ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_duration_half_hour` CHECK (`duration_minutes` % 30 = 0);--> statement-breakpoint
ALTER TABLE `cronograma_blocks` ADD CONSTRAINT `cronograma_blocks_end_within_day` CHECK (`start_minutes` + `duration_minutes` <= 1440);
