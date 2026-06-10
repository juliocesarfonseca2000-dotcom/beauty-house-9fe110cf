-- Adiciona campo "Quem retirou / Recebido por" às movimentações de estoque
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS taken_by text;
