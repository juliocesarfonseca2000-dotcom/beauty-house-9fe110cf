-- Adiciona a coluna 'origin' em packages para identificar pacotes importados de fichas em papel.
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'venda';

COMMENT ON COLUMN public.packages.origin IS
  'Origem do pacote: venda (default), ficha_importada (scan de ficha física), bonus (indicação).';
