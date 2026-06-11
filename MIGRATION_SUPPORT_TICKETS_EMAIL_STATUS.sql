-- Adiciona colunas para rastrear o envio de email de cada chamado.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS email_status text,        -- 'ok' | 'error' | 'pending' | null
  ADD COLUMN IF NOT EXISTS email_error text,         -- mensagem de erro, se houver
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
