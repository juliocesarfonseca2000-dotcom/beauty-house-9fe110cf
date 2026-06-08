-- ====================================================================
-- MIGRATION FASE 9 — Realtime global, Escala/Ponto, Faltas, Recorrência
-- Execute no SQL Editor do Supabase
-- ====================================================================

-- 1) Tabela de ausências (férias/folga/falta/licença)
CREATE TABLE IF NOT EXISTS public.staff_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('vacation','absent','dayoff','leave')),
  date_start date NOT NULL,
  date_end date NOT NULL,
  note text,
  created_by uuid REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_absences TO authenticated;
GRANT ALL ON public.staff_absences TO service_role;

ALTER TABLE public.staff_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all auth can read absences" ON public.staff_absences;
CREATE POLICY "all auth can read absences" ON public.staff_absences FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "all auth can write absences" ON public.staff_absences;
CREATE POLICY "all auth can write absences" ON public.staff_absences FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2) Colunas extras em sessions (motivo da falta)
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS miss_reason text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS signed_by uuid REFERENCES public.app_users(id);
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.app_users(id);

-- 3) Agendamento recorrente
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS recurrence_group uuid;

-- 4) Notificações: client_id opcional para deep-link
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS client_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS deep_tab text;

-- 5) REPLICA IDENTITY + supabase_realtime publication
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['clients','packages','sessions','appointments','procedures','products','financial_entries','app_users','staff_absences','notifications','client_packages','income','client_anamnesis','client_measurements'])
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END$$;
