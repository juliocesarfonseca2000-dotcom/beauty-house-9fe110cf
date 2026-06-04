-- FASE 8 — Anamnese estendida + medidas corporais + reforço bonus
-- Rodar no SQL Editor do Supabase

-- 1) Anamnese: novos campos
ALTER TABLE public.client_anamnesis
  ADD COLUMN IF NOT EXISTS chronic_diseases  TEXT,
  ADD COLUMN IF NOT EXISTS recent_surgeries  TEXT,
  ADD COLUMN IF NOT EXISTS pregnant_nursing  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pacemaker_metal   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coagulation_issue BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rare_conditions   TEXT,
  ADD COLUMN IF NOT EXISTS aesthetic_history TEXT;

-- 2) Medidas corporais (1 por cliente)
CREATE TABLE IF NOT EXISTS public.client_measurements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID UNIQUE NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  weight_kg   NUMERIC,
  waist_cm    NUMERIC,
  hip_cm      NUMERIC,
  abdomen_cm  NUMERIC,
  arm_cm      NUMERIC,
  thigh_cm    NUMERIC,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_measurements TO authenticated;
GRANT ALL ON public.client_measurements TO service_role;
ALTER TABLE public.client_measurements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth full" ON public.client_measurements;
CREATE POLICY "auth full" ON public.client_measurements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) Reforço: garantir colunas de bônus em packages (caso FASE7 não tenha rodado)
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS is_bonus            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bonus_validated     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bonus_validated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bonus_validated_by  UUID REFERENCES public.app_users(id);
