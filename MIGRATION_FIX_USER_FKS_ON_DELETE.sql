-- Permite excluir um usuário (app_users) mesmo que ele esteja referenciado
-- em outras tabelas. As referências são automaticamente setadas para NULL.

-- appointments.professional_id
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_professional_id_fkey;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_professional_id_fkey
  FOREIGN KEY (professional_id) REFERENCES public.app_users(id) ON DELETE SET NULL;

-- clients.evaluator_id
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_evaluator_id_fkey;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_evaluator_id_fkey
  FOREIGN KEY (evaluator_id) REFERENCES public.app_users(id) ON DELETE SET NULL;

-- sessions.professional_id
ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_professional_id_fkey;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_professional_id_fkey
  FOREIGN KEY (professional_id) REFERENCES public.app_users(id) ON DELETE SET NULL;

-- packages.professional_id
ALTER TABLE public.packages
  DROP CONSTRAINT IF EXISTS packages_professional_id_fkey;
ALTER TABLE public.packages
  ADD CONSTRAINT packages_professional_id_fkey
  FOREIGN KEY (professional_id) REFERENCES public.app_users(id) ON DELETE SET NULL;

-- income.professional_id
ALTER TABLE public.income
  DROP CONSTRAINT IF EXISTS income_professional_id_fkey;
ALTER TABLE public.income
  ADD CONSTRAINT income_professional_id_fkey
  FOREIGN KEY (professional_id) REFERENCES public.app_users(id) ON DELETE SET NULL;
