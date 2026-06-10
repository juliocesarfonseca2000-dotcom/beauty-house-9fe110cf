-- ====================================================================
-- MIGRATION FASE 10 — Ponto, Contratos digitais, Notificações anti-dup
-- Execute no SQL Editor do Supabase
-- ====================================================================

-- 1) Tabela de registro de ponto (time_entries)
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  date date NOT NULL,
  clock_in timestamptz,
  break_start timestamptz,
  break_end timestamptz,
  clock_out timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "all auth read time_entries" ON public.time_entries;
CREATE POLICY "all auth read time_entries" ON public.time_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "all auth write time_entries" ON public.time_entries;
CREATE POLICY "all auth write time_entries" ON public.time_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.time_entries REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 2) Tabela de contratos digitais
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  package_ids uuid[],
  financial_id uuid,
  clinic_snapshot jsonb,
  client_snapshot jsonb,
  items jsonb NOT NULL,
  total numeric(12,2) NOT NULL,
  payment_method text,
  installments int,
  pdf_path text,
  client_signature text,
  pro_signature text,
  pro_user_id uuid REFERENCES public.app_users(id),
  pro_user_name text,
  signed_at timestamptz,
  created_by uuid REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "all auth read contracts" ON public.contracts;
CREATE POLICY "all auth read contracts" ON public.contracts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "all auth insert contracts" ON public.contracts;
CREATE POLICY "all auth insert contracts" ON public.contracts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "all auth update unsigned contracts" ON public.contracts;
CREATE POLICY "all auth update unsigned contracts" ON public.contracts FOR UPDATE TO authenticated
  USING (signed_at IS NULL) WITH CHECK (true);
DROP POLICY IF EXISTS "admin delete contracts" ON public.contracts;
CREATE POLICY "admin delete contracts" ON public.contracts FOR DELETE TO authenticated USING (true);

ALTER TABLE public.contracts REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.contracts;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 3) Notificações: campos para anti-duplicata
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reference_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reference_type text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_unread
  ON public.notifications(type, reference_id)
  WHERE is_read = false AND reference_id IS NOT NULL;

-- 4) Backfill permission escala = true para todos os usuários ativos
UPDATE public.app_users
SET permissions = jsonb_set(
  COALESCE(permissions::jsonb, '{}'::jsonb),
  '{escala}',
  'true'::jsonb,
  true
)
WHERE permissions IS NULL OR NOT (permissions::jsonb ? 'escala');

-- 5) Storage bucket para contratos (criar manualmente no painel se necessário)
-- Pelo painel: Storage > New bucket > name="contracts", public=false
-- Policies (executar após criar bucket):
-- CREATE POLICY "auth read contracts bucket" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'contracts');
-- CREATE POLICY "auth write contracts bucket" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'contracts');

-- 6) Campos extras em system_settings (não precisa alterar tabela, é key-value)
-- Os valores 'clinic_info' e 'contract_clauses' serão salvos pelo SystemSettingsModal
