-- Permite "bloquear" um horário na agenda sem vincular cliente/procedimento
ALTER TABLE public.appointments ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN procedure_id DROP NOT NULL;
