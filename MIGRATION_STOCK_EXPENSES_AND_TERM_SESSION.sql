-- 1) Vincular movimentações de estoque a despesas e armazenar custo total da compra
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_total NUMERIC(10,2);

-- 2) Vincular termo assinado à sessão específica (termo por sessão)
ALTER TABLE public.signed_terms
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_signed_terms_session_id ON public.signed_terms(session_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_expense_id ON public.stock_movements(expense_id);
