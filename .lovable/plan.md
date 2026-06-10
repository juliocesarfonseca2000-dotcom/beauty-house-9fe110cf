# Plano de implementação

## 1. Remover aba "Escala & Ponto" do modal de usuário
- `usuarios.tsx`: remover state `tab`, abas, render condicional do `AbsencesTab`. Modal volta a ter só "Dados & Permissões".
- Manter `AbsencesTab.tsx` (será reutilizado no módulo dedicado).

## 2. Permissão "Escala & Ponto" + acesso da recepção
- `client.ts`: adicionar `escala: boolean` em `Permissions`.
- `usuarios.tsx`: adicionar `["escala", "Escala & Ponto"]` em `PERM_LABELS`. Defaults: admin=true, receptionist=true, professional=true (somente leitura via lógica de role).
- `Sidebar.tsx`: já mostra link conforme permissão — garantir entrada `escala`.
- Migração SQL: backfill `permissions->escala` para usuários existentes.

## 3. Estrutura do módulo Escala & Ponto (`/escala`)
- Refatorar `src/routes/_authenticated/escala.tsx` em duas abas: **Calendário** (atual) e **Ponto**.
- **Aba Calendário**: manter calendário atual + botão "+ Adicionar ausência" (modal com funcionário/tipo/datas/obs). Clique em célula abre modal de edição/exclusão. Todos os botões `type="button"` + `onClick`.
- **Aba Ponto**: nova UI com seletor de data, lista de funcionários ativos, status (sem registro / presente / em pausa / saiu / falta), botões "Entrada", "Iniciar pausa", "Fim pausa", "Saída". Edição inline de horários. Totalizador.
- **Histórico**: filtro por funcionário+período, tabela com colunas pedidas, badge de status (normal / hora extra / falta / folga), botão "Exportar PDF".

### Banco — nova tabela `time_entries`
```
id uuid pk, user_id uuid fk app_users, date date,
clock_in timestamptz, break_start timestamptz, break_end timestamptz, clock_out timestamptz,
note text, created_at, updated_at
unique(user_id, date)
```
RLS: SELECT/INSERT/UPDATE/DELETE para authenticated; lógica de role tratada no client (admin/recepção = todos; profissional = apenas próprio).

## 4. Cálculo automático de horas
- Função utilitária `computeTotalMinutes(entry)` em `src/lib/timeUtils.ts`.
- Formatação `formatHM(min)` → "8h30".
- Badges: >8h laranja (hora extra), <4h amarelo (suspeito).

## 5. Sidebar
- `Sidebar.tsx`: já tem item Escala. Confirmar visibilidade conforme `permissions.escala` (com fallback por role).

## 6. Contrato digital
### Dependências
- Adicionar `jspdf` e `jspdf-autotable` via `bun add`.

### Tabela `contracts`
```
id uuid pk, client_id uuid fk, package_id uuid fk nullable, financial_id uuid fk nullable,
clinic_snapshot jsonb, client_snapshot jsonb, items jsonb, total numeric,
payment_method text, installments int, pdf_path text,
client_signature text (data-url), pro_signature text, pro_user_id uuid,
signed_at timestamptz, created_at timestamptz default now()
```
RLS: leitura/insert/update para authenticated. Após `signed_at` setado, bloquear UPDATE via policy.

### Storage
- Bucket `contracts` (privado). Política: authenticated read/write.

### Settings (`system_settings`)
- Adicionar campos: `clinic_cnpj`, `clinic_address`, `clinic_phone`, `clinic_logo_url`, `contract_clauses` (text).
- Editáveis em `SystemSettingsModal.tsx`.

### UI
- `src/lib/contract-pdf.ts`: gera PDF via jsPDF + autoTable, embute assinaturas (base64 PNG).
- `src/components/contracts/ContractModal.tsx`: preview + 2 canvas (`SignaturePad` reutilizado das sessões) + botão "Finalizar e salvar".
- `fechar-pacote.tsx`: após confirmar pacote, botão "📄 Gerar Contrato".
- `SessionsTab.tsx`: botão "Ver contrato" em cada pacote.
- `financeiro` (histórico $ na ficha): botão "📄 Ver contrato".
- Contrato assinado: somente leitura (download/print).

## 7. Notificações anti-duplicata
### Migração
```sql
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS reference_id UUID,
  ADD COLUMN IF NOT EXISTS reference_type TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup
  ON public.notifications(user_id, type, reference_id)
  WHERE read = false AND reference_id IS NOT NULL;
```
### Lógica
- `NotificationBell.tsx`: antes de inserir, `SELECT` por `(type, reference_id, read=false)`. Se existir, pula. Para pacotes: comparar `available` salvo (guardar em `meta.sessions_left`); só recriar quando muda. Para inativos: usar ciclo (`reference_type='client_inactive_30'` / `_60`).
- Garantir que a varredura não recria notificações já lidas no mesmo ciclo.

## Arquivo de migração
- Criar `MIGRATION_FASE10.sql` com: `time_entries`, `contracts`, alterações de `notifications`, novos campos em `system_settings`, atualização de defaults de `permissions`, bucket `contracts` (instrução manual), RLS/GRANTs.

## Arquivos a criar
- `src/routes/_authenticated/escala.tsx` (refatorado: abas)
- `src/components/escala/CalendarTab.tsx`
- `src/components/escala/PontoTab.tsx`
- `src/components/escala/AbsenceModal.tsx`
- `src/components/escala/PontoHistory.tsx`
- `src/lib/timeUtils.ts`
- `src/lib/contract-pdf.ts`
- `src/components/contracts/ContractModal.tsx`
- `MIGRATION_FASE10.sql`

## Arquivos a editar
- `src/integrations/supabase/client.ts` (Permissions)
- `src/routes/_authenticated/usuarios.tsx` (remover aba, novo perm label)
- `src/components/layout/Sidebar.tsx` (perm escala)
- `src/components/system/SystemSettingsModal.tsx` (campos clínica + cláusulas)
- `src/routes/_authenticated/fechar-pacote.tsx` (botão contrato)
- `src/components/clients/SessionsTab.tsx` (botão ver contrato)
- `src/routes/_authenticated/financeiro.tsx` ou ficha $ tab (botão ver contrato)
- `src/components/notifications/NotificationBell.tsx` (anti-duplicata)
- `package.json` (jspdf, jspdf-autotable)

## Observação
`MIGRATION_FASE10.sql` precisa ser executado manualmente no Supabase SQL Editor + criação do bucket `contracts` (privado).

Posso prosseguir com a implementação completa?
