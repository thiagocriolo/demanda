-- Convert values previously created from display labels before enforcing the
-- fixed business-status vocabulary.
UPDATE `businesses`
SET `stage_key` = 'ativo'
WHERE `stage_key` IN ('ativado', 'ativa', 'ativada');--> statement-breakpoint

ALTER TABLE `businesses`
  ADD CONSTRAINT `businesses_stage_key_allowed`
  CHECK (`stage_key` IN ('negociacao', 'contratacao', 'ativo', 'encerrado', 'arquivado'));
