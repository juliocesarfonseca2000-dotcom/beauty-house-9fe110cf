-- Fix: coluna staff_absences.note ausente em instalações antigas
ALTER TABLE public.staff_absences ADD COLUMN IF NOT EXISTS note text;
