# Beauty House — Pacote de melhorias (14 itens)

Vou implementar tudo em um único pacote, criando 1 migration SQL nova e refatorando os módulos afetados. Abaixo o que será feito agrupado por área.

## 1. Banco de dados — `MIGRATION_FASE9.sql`

Nova migration única com:

- Tabela `staff_absences` (id, user_id, type enum: vacation|absent|dayoff|leave, date_start, date_end, note, created_by, created_at) + RLS + GRANTs
- Coluna `sessions.miss_reason` (text) + `sessions.miss_kind` (`justified|unjustified|null`) para guardar histórico de faltas
- Coluna `appointments.recurrence_group` (uuid) para agrupar recorrências
- Coluna `sessions.signed_by` (uuid → app_users.id) e `signed_at` (timestamp) — já pode existir; só adicionar se faltar
- Coluna `notifications.client_id` (uuid) opcional para deep-link
- Adicionar todas as tabelas críticas ao `supabase_realtime` publication: clients, packages, sessions, appointments, procedures, products, financial_entries, app_users, staff_absences, notifications, client_packages
- `REPLICA IDENTITY FULL` em cada uma

## 2. Realtime global (item 1)

- Expandir `src/hooks/useRealtimeSync.ts` para incluir as 10 tabelas listadas
- Garantir invalidate em chaves derivadas (já faz)
- Confirmar que está sendo chamado no root autenticado

## 3. Topbar (itens 2, 3, 4, 5, 6, 7, 8, 9)

- Remover o ícone de triângulo (low packages dropdown) do `Topbar.tsx`
- Manter sino + cubo
- Refatorar `NotificationBell.tsx`:
  - Geração consolidada de alertas: pacote ≤2, cliente +30d, cliente +60d, sessão não confirmada +30min
  - Só roda/exibe para admin e receptionist
  - Cada item: nome, descrição, "há X tempo", botão ✕ para excluir individual
  - Botão "Marcar todas como lidas"
  - Rodapé: link "Ver todas as notificações →"
  - Click no item: navega para `/clientes/{id}?tab=sessions|data` ou `/agenda?date=...` e marca como lida

## 4. Nova página `/notificacoes` (item 9)

- Rota `_authenticated/notificacoes.tsx` com filtros (Todas/Pacotes/Clientes sumindo/Sessões), tabela, ações ir para ficha + excluir, "Limpar todas lidas"

## 5. Ficha do cliente — aceitar `?tab=` (item 5)

- `clientes.$id.tsx` lê `useSearch` e define aba inicial

## 6. Login redirect por perfil (item 11)

- Em `login.tsx`: após autenticar, navegar para `/` se admin, `/agenda` caso contrário
- Em `_authenticated/index.tsx` (dashboard): se `user.role !== "admin"`, `redirect({ to: "/agenda" })` no `beforeLoad`/effect

## 7. Modal de assinatura salva (item 12)

- Em `SessionsTab.tsx`: ícone cadeado clicável quando sessão concluída → modal mostra miniatura, profissional (`signed_by`), data/hora, cliente, procedimento

## 8. Lógica de faltas (item 13)

- No modal de sessão (SessionsTab): substituir botão "falta" por sub-modal com "Justificada / Não justificada"
- Justificada: motivo obrigatório, gera +1 sessão extra (incrementa `sess_total`), círculo cinza
- Não justificada: aviso, marca `miss_kind='unjustified'`, círculo vermelho escuro, sem incremento
- Nenhum dos casos altera `sess_done`

## 9. Agendamento recorrente (item 14)

- No modal "+ Agendar" da Agenda: toggle "Repetir para todas as sessões do pacote"
- Campos: dia da semana, horário, data início, lê sessões restantes do pacote ativo
- Cria N appointments com mesmo `recurrence_group`, pulando dias de ausência (avisa)

## 10. Escala & Ponto (item 10)

- Em `usuarios.tsx`: aba "Escala & Ponto" no `UserModal` com CRUD de `staff_absences` (badges coloridos por tipo)
- Botão "Ver escala geral" no topo → nova rota `_authenticated/escala.tsx` com calendário mensal
- Acesso: admin edita todos; recepção lê profissionais; profissional só a própria
- Agenda (`agenda.tsx`): consulta `staff_absences` por dia e bloqueia coluna do profissional com banner; destaca appointments existentes em vermelho

## Arquivos a criar
- `MIGRATION_FASE9.sql`
- `src/routes/_authenticated/notificacoes.tsx`
- `src/routes/_authenticated/escala.tsx`
- `src/components/users/AbsencesTab.tsx`
- `src/components/clients/SignatureViewerModal.tsx`
- `src/components/clients/MissSessionModal.tsx`
- `src/components/agenda/RecurrenceFields.tsx` (inline ok também)

## Arquivos a editar
- `src/hooks/useRealtimeSync.ts`
- `src/components/layout/Topbar.tsx`
- `src/components/notifications/NotificationBell.tsx`
- `src/routes/login.tsx`
- `src/routes/_authenticated/index.tsx`
- `src/routes/_authenticated/clientes.$id.tsx`
- `src/routes/_authenticated/usuarios.tsx`
- `src/routes/_authenticated/agenda.tsx`
- `src/components/clients/SessionsTab.tsx`
- `src/routeTree.gen.ts` (auto)

## Observação sobre a migration

`MIGRATION_FASE9.sql` precisa ser executada manualmente no SQL Editor do Supabase antes que as features de escala, faltas detalhadas e recorrência funcionem 100%. O Realtime publication também é aplicado nela.

Posso prosseguir com a implementação?