-- Permite excluir um usuário (app_users) mesmo que ele esteja referenciado
-- em outras tabelas. As referências viram NULL automaticamente.
-- Só altera FKs cujas colunas realmente existem no schema atual.

DO $$
DECLARE
  rec record;
  pairs text[][] := ARRAY[
    ['appointments','professional_id','appointments_professional_id_fkey'],
    ['clients','evaluator_id','clients_evaluator_id_fkey'],
    ['sessions','professional_id','sessions_professional_id_fkey'],
    ['packages','professional_id','packages_professional_id_fkey'],
    ['income','professional_id','income_professional_id_fkey']
  ];
  i int;
  tbl text; col text; fk text;
BEGIN
  FOR i IN 1..array_length(pairs,1) LOOP
    tbl := pairs[i][1]; col := pairs[i][2]; fk := pairs[i][3];

    -- Verifica se a tabela e coluna existem
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=tbl AND column_name=col
    ) THEN
      -- Dropa qualquer FK existente nessa coluna apontando para app_users
      FOR rec IN
        SELECT tc.constraint_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type='FOREIGN KEY'
           AND tc.table_schema='public'
           AND tc.table_name = tbl
           AND kcu.column_name = col
      LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tbl, rec.constraint_name);
      END LOOP;

      -- Recria a FK com ON DELETE SET NULL
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.app_users(id) ON DELETE SET NULL',
        tbl, fk, col
      );
    END IF;
  END LOOP;
END $$;
