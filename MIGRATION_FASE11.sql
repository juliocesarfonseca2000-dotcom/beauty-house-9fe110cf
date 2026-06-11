-- ============================================================
-- Beauty House — Fase 11 (correções + novas funcionalidades)
-- Rode TODO o arquivo no SQL Editor.
-- ============================================================

-- 1. app_users: suporte a kiosk + identificação por CPF/avatar
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS is_kiosk BOOLEAN DEFAULT false;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. procedures: termo de consentimento opcional
ALTER TABLE public.procedures ADD COLUMN IF NOT EXISTS requires_term BOOLEAN DEFAULT false;
ALTER TABLE public.procedures ADD COLUMN IF NOT EXISTS term_text TEXT;

-- 3. signed_terms: registros de termos assinados
CREATE TABLE IF NOT EXISTS public.signed_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES public.packages(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  procedure_id UUID REFERENCES public.procedures(id),
  term_text TEXT NOT NULL,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signed_terms TO authenticated;
GRANT ALL ON public.signed_terms TO service_role;
ALTER TABLE public.signed_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signed_terms_all_auth" ON public.signed_terms;
CREATE POLICY "signed_terms_all_auth" ON public.signed_terms FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. income: taxa de cartão configurável por venda
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS card_fee_pct NUMERIC DEFAULT 0;
ALTER TABLE public.income ADD COLUMN IF NOT EXISTS card_fee_payer TEXT;

-- 5. appointments: permitir agendamento sem procedimento + flag de fechamento
ALTER TABLE public.appointments ALTER COLUMN procedure_id DROP NOT NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS pending_close BOOLEAN DEFAULT false;

-- 6. support_tickets: chamados de suporte
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  page TEXT,
  user_agent TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_tickets_insert_auth" ON public.support_tickets;
CREATE POLICY "support_tickets_insert_auth" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "support_tickets_select_auth" ON public.support_tickets;
CREATE POLICY "support_tickets_select_auth" ON public.support_tickets FOR SELECT TO authenticated USING (true);

-- ============================================================
-- IMPORTANTE: Após rodar, sete manualmente a conta de kiosk:
--   UPDATE app_users SET is_kiosk = true WHERE email = 'ponto@beautyhouse.com';
-- ============================================================
