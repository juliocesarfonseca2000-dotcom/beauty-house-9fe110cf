-- ============================================================
-- BEAUTY HOUSE — Migração Fase 6 (Performance + ajustes)
-- Rode INTEIRO no SQL Editor do Supabase
-- ============================================================

-- ============= ÍNDICES DE PERFORMANCE =============
create index if not exists idx_clients_active_name on public.clients(active, name);
create index if not exists idx_clients_record_num on public.clients(record_num);
create index if not exists idx_clients_evaluator on public.clients(evaluator_id);

create index if not exists idx_sessions_client on public.sessions(client_id);
create index if not exists idx_sessions_status on public.sessions(status);
create index if not exists idx_sessions_package_status on public.sessions(package_id, status);

create index if not exists idx_packages_status on public.packages(status);
create index if not exists idx_packages_client_status on public.packages(client_id, status);
create index if not exists idx_packages_procedure on public.packages(procedure_id);

create index if not exists idx_appointments_date_prof on public.appointments(datetime, professional_id);
create index if not exists idx_appointments_client on public.appointments(client_id);
create index if not exists idx_appointments_status on public.appointments(status);

create index if not exists idx_stock_movements_product_date on public.stock_movements(product_id, created_at desc);

create index if not exists idx_income_client on public.income(client_id);
create index if not exists idx_income_package on public.income(package_id);
create index if not exists idx_expenses_category on public.expenses(category);

create index if not exists idx_client_photos_client on public.client_photos(client_id);
create index if not exists idx_products_active on public.products(active);

-- ============= GARANTIR is_evaluator (caso a tabela seja antiga) =============
alter table public.app_users add column if not exists is_evaluator boolean default false;

-- ============= ANALYZE =============
analyze public.clients;
analyze public.sessions;
analyze public.packages;
analyze public.appointments;
analyze public.income;
analyze public.expenses;
