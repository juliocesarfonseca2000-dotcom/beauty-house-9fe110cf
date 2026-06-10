-- Backfill: cria pacotes de brinde (is_bonus = true) + sessões pendentes
-- para clientes que receberam bônus de indicação (referral_bonuses.awarded = true)
-- mas ainda não têm o pacote correspondente em public.packages.
--
-- Rode no SQL Editor do Supabase. Idempotente: pode ser executado várias vezes.

do $$
declare
  cfg jsonb;
  bonus_proc_id uuid;
  bonus_qty int;
  bonus_proc_name text;
  rec record;
  new_pkg_id uuid;
  i int;
begin
  -- Lê a configuração do bônus
  select value into cfg from public.system_settings where key = 'bonus_config' limit 1;

  bonus_proc_id := nullif(cfg->>'procedure_id','')::uuid;
  bonus_qty     := coalesce((cfg->>'sessions_count')::int, 5);

  if bonus_proc_id is null then
    -- fallback para legacy public.settings
    select s.bonus_proc_id, coalesce(s.bonus_qty,5)
      into bonus_proc_id, bonus_qty
      from public.settings s limit 1;
  end if;

  if bonus_proc_id is null then
    raise notice 'Nenhum procedure_id de bônus configurado — nada a fazer.';
    return;
  end if;

  select name into bonus_proc_name from public.procedures where id = bonus_proc_id;

  -- Para cada cliente que indicou alguém (e bônus foi awarded),
  -- e que NÃO tem pacote de brinde desse procedimento ainda, cria o pacote.
  for rec in
    select distinct rb.from_client_id as client_id
    from public.referral_bonuses rb
    where rb.awarded = true
      and not exists (
        select 1 from public.packages p
        where p.client_id = rb.from_client_id
          and p.procedure_id = bonus_proc_id
          and coalesce(p.is_bonus, false) = true
      )
  loop
    insert into public.packages
      (client_id, procedure_id, sess_total, sess_done, price_full, price_paid,
       discount_pct, pay_method, status, is_bonus)
    values
      (rec.client_id, bonus_proc_id, bonus_qty, 0, 0, 0,
       0, 'bonus', 'active', true)
    returning id into new_pkg_id;

    for i in 1..bonus_qty loop
      insert into public.sessions (package_id, client_id, session_num, status)
      values (new_pkg_id, rec.client_id, i, 'pending');
    end loop;

    raise notice 'Pacote brinde criado para cliente % (procedimento %)', rec.client_id, bonus_proc_name;
  end loop;
end $$;
