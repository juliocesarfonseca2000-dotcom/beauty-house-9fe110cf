-- ============================================================
-- BEAUTY HOUSE — Script de criação do banco no Supabase
-- Rode este arquivo INTEIRO no SQL Editor do seu projeto Supabase
-- (https://supabase.com/dashboard → SQL Editor → New query)
-- ============================================================

-- ============= EXTENSIONS =============
create extension if not exists "pgcrypto";

-- ============= ENUMS =============
do $$ begin
  create type app_role as enum ('admin','receptionist','professional');
exception when duplicate_object then null; end $$;

-- ============= TABLES =============

-- Usuários do sistema (linkados a auth.users)
create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role app_role not null default 'professional',
  cargo text,
  is_evaluator boolean default false,
  permissions jsonb default '{"dash":true,"agenda":true,"clientes":true,"ficha":true,"fechar":true,"procedimentos":true,"estoque":true,"financeiro":false,"relatorios":false,"usuarios":false}'::jsonb,
  active boolean default true,
  created_at timestamptz default now()
);

-- Sequencial de ficha
create sequence if not exists public.client_record_seq start 1000;

-- Clientes
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  record_num integer unique not null default nextval('public.client_record_seq'),
  name text not null,
  phone text,
  email text,
  birthdate date,
  cpf text,
  referral text,
  referral_client_id uuid references public.clients(id),
  evaluator_id uuid references public.app_users(id),
  weight numeric, waist numeric, hip numeric, abdomen numeric, arm numeric, thigh numeric,
  anamnese jsonb default '{}'::jsonb,
  notes text,
  active boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_clients_active on public.clients(active);
create index if not exists idx_clients_name on public.clients using gin (to_tsvector('simple', name));

-- Procedimentos
create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_min integer default 60,
  price_single numeric,
  price_5 numeric,
  price_10 numeric,
  price_20 numeric,
  active boolean default true,
  created_at timestamptz default now()
);

-- Pacotes
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id),
  sess_total integer not null,
  sess_done integer default 0,
  purchase_date date default current_date,
  expires_at date,
  price_full numeric,
  price_paid numeric,
  discount_pct numeric default 0,
  pay_method text,
  status text default 'active',
  renewal integer default 1,
  created_at timestamptz default now()
);
create index if not exists idx_packages_client on public.packages(client_id);

-- Sessões
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  session_num integer not null,
  status text default 'pending',
  done_at timestamptz,
  professional_id uuid references public.app_users(id),
  signature_url text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_sessions_package on public.sessions(package_id);

-- Agendamentos
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  procedure_id uuid references public.procedures(id),
  professional_id uuid not null references public.app_users(id),
  datetime timestamptz not null,
  duration_min integer default 60,
  status text default 'pending',
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_appointments_date on public.appointments(datetime);
create index if not exists idx_appointments_prof on public.appointments(professional_id);

-- Receitas
create table if not exists public.income (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  package_id uuid references public.packages(id),
  description text,
  amount numeric not null,
  discount_val numeric default 0,
  pay_method text,
  date date default current_date,
  created_at timestamptz default now()
);
create index if not exists idx_income_date on public.income(date);

-- Despesas
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text,
  description text,
  amount numeric not null,
  date date default current_date,
  created_at timestamptz default now()
);
create index if not exists idx_expenses_date on public.expenses(date);

-- Produtos
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  brand text,
  unit text default 'un',
  qty_current numeric default 0,
  qty_min numeric default 0,
  cost_price numeric,
  active boolean default true,
  created_at timestamptz default now()
);

-- Movimentações de estoque
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null,
  quantity numeric not null,
  reason text,
  notes text,
  created_by uuid references public.app_users(id),
  created_at timestamptz default now()
);

-- Fotos
create table if not exists public.client_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  url text not null,
  category text,
  procedure_id uuid references public.procedures(id),
  date date default current_date,
  created_at timestamptz default now()
);

-- Bônus de indicação
create table if not exists public.referral_bonuses (
  id uuid primary key default gen_random_uuid(),
  from_client_id uuid not null references public.clients(id) on delete cascade,
  to_client_name text,
  awarded boolean default false,
  created_at timestamptz default now()
);

-- Configurações
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  admin_password text default '@BeautyLu2026',
  finance_pin text default '1234',
  bonus_proc_id uuid references public.procedures(id),
  bonus_qty integer default 5
);

-- ============= GRANTS (Data API) =============
grant select, insert, update, delete on public.app_users to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.procedures to authenticated;
grant select, insert, update, delete on public.packages to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.income to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.stock_movements to authenticated;
grant select, insert, update, delete on public.client_photos to authenticated;
grant select, insert, update, delete on public.referral_bonuses to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant usage on sequence public.client_record_seq to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ============= RLS =============
-- Função utilitária: pega role do usuário atual
create or replace function public.current_user_role()
returns app_role
language sql stable security definer set search_path = public
as $$ select role from public.app_users where id = auth.uid() limit 1 $$;

alter table public.app_users enable row level security;
alter table public.clients enable row level security;
alter table public.procedures enable row level security;
alter table public.packages enable row level security;
alter table public.sessions enable row level security;
alter table public.appointments enable row level security;
alter table public.income enable row level security;
alter table public.expenses enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.client_photos enable row level security;
alter table public.referral_bonuses enable row level security;
alter table public.settings enable row level security;

-- Policies: usuários autenticados lidam com seus dados clínicos.
-- (Restrições por módulo são aplicadas no app via "permissions".)
do $$
declare t text;
begin
  for t in select unnest(array[
    'app_users','clients','procedures','packages','sessions','appointments',
    'income','expenses','products','stock_movements','client_photos',
    'referral_bonuses','settings'
  ]) loop
    execute format('drop policy if exists "authed_all" on public.%I', t);
    execute format('create policy "authed_all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ============= STORAGE BUCKETS =============
insert into storage.buckets (id, name, public)
values ('signatures','signatures', false),
       ('client-photos','client-photos', false),
       ('authorization-terms','authorization-terms', false)
on conflict (id) do nothing;

drop policy if exists "auth read sigs" on storage.objects;
drop policy if exists "auth write sigs" on storage.objects;
create policy "auth read sigs" on storage.objects for select to authenticated
  using (bucket_id in ('signatures','client-photos','authorization-terms'));
create policy "auth write sigs" on storage.objects for insert to authenticated
  with check (bucket_id in ('signatures','client-photos','authorization-terms'));
create policy "auth update sigs" on storage.objects for update to authenticated
  using (bucket_id in ('signatures','client-photos','authorization-terms'));
create policy "auth delete sigs" on storage.objects for delete to authenticated
  using (bucket_id in ('signatures','client-photos','authorization-terms'));

-- ============= TRIGGER: lançamento automático no financeiro ao criar pacote =============
create or replace function public.auto_income_on_package()
returns trigger language plpgsql security definer set search_path = public as $$
declare cli_name text; proc_name text;
begin
  select name into cli_name from public.clients where id = new.client_id;
  select name into proc_name from public.procedures where id = new.procedure_id;
  insert into public.income (client_id, package_id, description, amount, discount_val, pay_method, date)
  values (
    new.client_id, new.id,
    coalesce(proc_name,'Procedimento') || ' — ' || new.sess_total || ' sessões · ' || coalesce(cli_name,''),
    coalesce(new.price_paid, new.price_full, 0),
    coalesce(new.price_full,0) - coalesce(new.price_paid,0),
    new.pay_method,
    coalesce(new.purchase_date, current_date)
  );
  return new;
end $$;
drop trigger if exists trg_auto_income on public.packages;
create trigger trg_auto_income after insert on public.packages
for each row execute function public.auto_income_on_package();

-- ============= SEED: PROCEDIMENTOS =============
insert into public.procedures (name, duration_min, price_single, price_5, price_10, price_20) values
  ('Massagem Comum 20''', 20, 105,  446, 758,  1289),
  ('Massagem Comum 40''', 40, 210,  892, 1517, 2579),
  ('Massagem Comum 60''', 60, null, 1338, 2275, 3868),
  ('Holonyac Área M',    60, null, 1232, 2095, 3561),
  ('Holonyac Área G',    60, null, 2082, 3540, 6018),
  ('Equipamento Grupo 1',50, 195, 750,  1275, 2160),
  ('Botox Só Glabela',   30, 1240, null, null, null),
  ('Botox Full Face',    45, 2990, null, null, null),
  ('Ultraformer Full Face 600', 60, 4990, null, null, null),
  ('Dermapen/MMP/PRP',   60, null, 3395, 5772, 9813)
on conflict do nothing;

-- ============= SEED: SETTINGS =============
insert into public.settings (id) values (gen_random_uuid()) on conflict do nothing;
update public.settings set bonus_proc_id = (select id from public.procedures where name='Massagem Comum 40''' limit 1) where bonus_proc_id is null;

-- ============================================================
-- DEPOIS DE RODAR ESTE SCRIPT:
-- 1. Vá em Authentication → Users → "Add user" → "Create new user"
--    Email: luciana@beautyhouse.com
--    Senha: Lu2026Beauty
--    ✅ Auto Confirm User
-- 2. Copie o UUID gerado e rode no SQL Editor:
--      insert into public.app_users (id, name, email, role, is_evaluator,
--        permissions, active)
--      values (
--        'COLE_O_UUID_AQUI',
--        'Luciana', 'luciana@beautyhouse.com', 'admin', true,
--        '{"dash":true,"agenda":true,"clientes":true,"ficha":true,"fechar":true,"procedimentos":true,"estoque":true,"financeiro":true,"relatorios":true,"usuarios":true}'::jsonb,
--        true
--      );
-- 3. Pronto! Faça login no sistema.
-- ============================================================
