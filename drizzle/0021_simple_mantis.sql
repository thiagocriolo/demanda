DELETE FROM "app"."task_responsibles" responsible
USING (
	SELECT ctid, row_number() OVER (
		PARTITION BY "workspace_id", "task_id"
		ORDER BY "sort_order", "user_id"
	) AS position
	FROM "app"."task_responsibles"
) duplicate
WHERE responsible.ctid = duplicate.ctid
	AND duplicate.position > 1;--> statement-breakpoint
ALTER TABLE "app"."task_responsibles" ADD CONSTRAINT "task_responsibles_workspace_task_unique" UNIQUE("workspace_id","task_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."enforce_cronograma_block_responsible_rules"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text, 20260714));

	IF NOT EXISTS (
		SELECT 1
		FROM "app"."task_responsibles" assigned
		WHERE assigned."workspace_id" = NEW."workspace_id"
			AND assigned."task_id" = NEW."task_id"
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23503',
			CONSTRAINT = 'cronograma_blocks_task_responsible_required',
			MESSAGE = 'A subtarefa precisa pertencer a uma tarefa com responsavel.';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "app"."task_responsibles" candidate_responsible
		INNER JOIN "app"."task_responsibles" other_responsible
			ON other_responsible."workspace_id" = candidate_responsible."workspace_id"
			AND other_responsible."user_id" = candidate_responsible."user_id"
		INNER JOIN "app"."cronograma_blocks" other_block
			ON other_block."workspace_id" = other_responsible."workspace_id"
			AND other_block."task_id" = other_responsible."task_id"
		WHERE candidate_responsible."workspace_id" = NEW."workspace_id"
			AND candidate_responsible."task_id" = NEW."task_id"
			AND other_block."id" IS DISTINCT FROM NEW."id"
			AND other_block."scheduled_date" = NEW."scheduled_date"
			AND NEW."start_minutes" < other_block."start_minutes" + other_block."duration_minutes"
			AND other_block."start_minutes" < NEW."start_minutes" + NEW."duration_minutes"
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23P01',
			CONSTRAINT = 'cronograma_blocks_responsible_no_overlap',
			MESSAGE = 'O responsavel ja possui outro bloco nesse horario.';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "cronograma_blocks_responsible_rules_trigger"
BEFORE INSERT OR UPDATE OF "workspace_id", "task_id", "scheduled_date", "start_minutes", "duration_minutes"
ON "app"."cronograma_blocks"
FOR EACH ROW
EXECUTE FUNCTION "app"."enforce_cronograma_block_responsible_rules"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."enforce_task_responsible_schedule_rules"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text, 20260714));

	IF EXISTS (
		SELECT 1
		FROM "app"."cronograma_blocks" candidate_block
		INNER JOIN "app"."task_responsibles" other_responsible
			ON other_responsible."workspace_id" = NEW."workspace_id"
			AND other_responsible."user_id" = NEW."user_id"
		INNER JOIN "app"."cronograma_blocks" other_block
			ON other_block."workspace_id" = other_responsible."workspace_id"
			AND other_block."task_id" = other_responsible."task_id"
		WHERE candidate_block."workspace_id" = NEW."workspace_id"
			AND candidate_block."task_id" = NEW."task_id"
			AND other_block."id" <> candidate_block."id"
			AND other_block."scheduled_date" = candidate_block."scheduled_date"
			AND candidate_block."start_minutes" < other_block."start_minutes" + other_block."duration_minutes"
			AND other_block."start_minutes" < candidate_block."start_minutes" + candidate_block."duration_minutes"
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23P01',
			CONSTRAINT = 'task_responsibles_cronograma_no_overlap',
			MESSAGE = 'A troca de responsavel cria conflito no Cronograma.';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "task_responsibles_schedule_rules_trigger"
AFTER INSERT OR UPDATE OF "workspace_id", "task_id", "user_id"
ON "app"."task_responsibles"
FOR EACH ROW
EXECUTE FUNCTION "app"."enforce_task_responsible_schedule_rules"();
