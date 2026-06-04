-- =====================================================================
-- BEAUTY HOUSE — FASE 7 (correções v2)
-- Execute este script INTEIRO no SQL Editor do Supabase (Lovable Cloud).
-- É idempotente: pode rodar várias vezes sem quebrar nada.
-- =====================================================================

-- 1. Sessões: assinatura base64 e status detalhado --------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS signature_data TEXT,
  ADD COLUMN IF NOT EXISTS session_status TEXT
    DEFAULT 'pending'
    CHECK (session_status IN ('pending','confirmed','missed_justified','missed_unjustified'));

-- 2. system_settings (engrenagem) -------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth full" ON public.system_settings;
CREATE POLICY "auth full" ON public.system_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. session_notes (prontuário por sessão) ----------------------------
CREATE TABLE IF NOT EXISTS public.session_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  procedure_id UUID REFERENCES public.procedures(id),
  equipment    TEXT,
  parameters   TEXT,
  notes        TEXT,
  created_by   UUID REFERENCES public.app_users(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_notes_client_idx ON public.session_notes(client_id, date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_notes TO authenticated;
GRANT ALL ON public.session_notes TO service_role;
ALTER TABLE public.session_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth full" ON public.session_notes;
CREATE POLICY "auth full" ON public.session_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. client_anamnesis (1 por cliente) ---------------------------------
CREATE TABLE IF NOT EXISTS public.client_anamnesis (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID UNIQUE NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  health_history    TEXT,
  allergies         TEXT,
  medications       TEXT,
  contraindications TEXT,
  updated_at        TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_anamnesis TO authenticated;
GRANT ALL ON public.client_anamnesis TO service_role;
ALTER TABLE public.client_anamnesis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth full" ON public.client_anamnesis;
CREATE POLICY "auth full" ON public.client_anamnesis
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. notifications (sino) ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_roles   TEXT[] NOT NULL DEFAULT ARRAY['admin','receptionist'],
  type           TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  action_url     TEXT,
  appointment_id UUID,
  is_read        BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications(is_read, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth full" ON public.notifications;
CREATE POLICY "auth full" ON public.notifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. packages: campos de validação de bônus ---------------------------
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS is_bonus BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bonus_validated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bonus_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bonus_validated_by UUID REFERENCES public.app_users(id);

-- 7. Realtime para notifications --------------------------------------
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.session_notes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- 8. Bucket client-photos (caso não exista) ---------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos','client-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies do bucket
DROP POLICY IF EXISTS "client-photos read" ON storage.objects;
CREATE POLICY "client-photos read" ON storage.objects
  FOR SELECT USING (bucket_id='client-photos');

DROP POLICY IF EXISTS "client-photos write" ON storage.objects;
CREATE POLICY "client-photos write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id='client-photos');

DROP POLICY IF EXISTS "client-photos del" ON storage.objects;
CREATE POLICY "client-photos del" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id='client-photos');

-- 9. Seed system_settings padrão --------------------------------------
INSERT INTO public.system_settings (key, value)
VALUES ('bonus_config', '{"procedure_id":null,"procedure_name":null,"sessions_count":5}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- FIM
-- =====================================================================
