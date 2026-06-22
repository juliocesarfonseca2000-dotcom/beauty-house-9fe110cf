-- ============================================================
-- MIGRATION_SALAS_APARELHOS.sql
-- Rodar no SQL Editor do Supabase (Project → SQL Editor → New query)
-- Seguro e incremental: usa IF NOT EXISTS em todas as criações
-- ============================================================

-- 1) Segundo tempo opcional no procedimento
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS duration_min_2 integer;

-- 2) Salas (cadastro próprio)
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  purpose text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3) Aparelhos (cadastro próprio)
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 4) Vínculo procedimento -> sala (1 sala por procedimento)
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES rooms(id) ON DELETE SET NULL;

-- 5) Vínculo procedimento <-> aparelhos (muitos-para-muitos)
CREATE TABLE IF NOT EXISTS procedure_equipment (
  procedure_id uuid REFERENCES procedures(id) ON DELETE CASCADE,
  equipment_id uuid REFERENCES equipment(id) ON DELETE CASCADE,
  PRIMARY KEY (procedure_id, equipment_id)
);

-- 6) RLS: liberar para usuários autenticados (mesmo padrão das outras tabelas)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedure_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY rooms_all ON rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY equipment_all ON equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY procedure_equipment_all ON procedure_equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);
