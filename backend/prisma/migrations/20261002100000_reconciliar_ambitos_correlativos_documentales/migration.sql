-- Reconciliación segura para bases creadas antes de la migración de tipos
-- documentales. No modifica correlativos ni datos históricos.
DO $$
BEGIN
  ALTER TYPE "AmbitoCorrelativoDocumental" ADD VALUE IF NOT EXISTS 'DOC_INFORME';
  ALTER TYPE "AmbitoCorrelativoDocumental" ADD VALUE IF NOT EXISTS 'DOC_DIRECTIVA';
  ALTER TYPE "AmbitoCorrelativoDocumental" ADD VALUE IF NOT EXISTS 'DOC_CIRCULAR';
  ALTER TYPE "AmbitoCorrelativoDocumental" ADD VALUE IF NOT EXISTS 'DOC_PARTE';
END
$$;
