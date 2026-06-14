-- Adiciona o tipo de sessão aos procedimentos.
-- Valores aceitos: 'sessoes' (tabela 1 — pacotes 5/10/20), 'avulso' (tabela 2 — apenas price_single),
-- 'especial' (ex: "Compra 2, faz 3"), 'por_disparo' (cobrado por disparo, ex: R$ 1,00).

ALTER TABLE public.procedures
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'sessoes';

ALTER TABLE public.procedures
  DROP CONSTRAINT IF EXISTS procedures_session_type_check;

ALTER TABLE public.procedures
  ADD CONSTRAINT procedures_session_type_check
  CHECK (session_type IN ('sessoes', 'avulso', 'especial', 'por_disparo'));
