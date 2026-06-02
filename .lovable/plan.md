# Plano de Correções Urgentes

Escopo grande — vou dividir em 7 frentes, na ordem de impacto.

## 1. Performance (prioridade máxima)

**Migração SQL** — índices nas colunas mais consultadas:
- `clients(active, name)`, `clients(record_num)`
- `sessions(client_id, status)`, `sessions(package_id)`, `sessions(scheduled_at)`
- `packages(client_id, status)`, `packages(procedure_id)`
- `appointments(scheduled_at, professional_id)`, `appointments(client_id)`
- `stock_movements(product_id, created_at)`
- `incomes(date)`, `expenses(date)`

**Código**:
- Substituir `select("*")` por colunas específicas em todas as páginas
- Trocar múltiplas queries sequenciais por `Promise.all`
- Agenda/Dashboard/Relatórios: filtrar no servidor (range de data), não no cliente
- Cache leve com `useMemo` para agregações já existentes
- Adicionar `staleTime` nas queries de listas (procedimentos, usuários, produtos) — dados pouco mutáveis

## 2. Sidebar com seções

Reescrever `Sidebar.tsx`:
- Topo (sem label): Dashboard, Agenda
- Label "Principal": Clientes
- Label "Atendimento": Ficha & Sessões, Fechar Pacote, Procedimentos
- Label "Gestão": Financeiro, Estoque, Relatórios, Usuários

## 3. Agenda multi-profissional (estilo Avec)

Reescrever `/agenda`:
- Header: seletor de data + filtro de profissional (opcional)
- Grid: 1 coluna fixa de horários (08:00–18:00, slots de 30min) + N colunas (uma por profissional ativo)
- Cada agendamento renderizado como bloco posicionado por horário/duração
- Clique em slot vazio → novo agendamento; clique em bloco → editar/cancelar
- Mobile: dropdown de profissional + coluna única

## 4. Fechar Pacote (2 colunas + múltiplos itens)

Reescrever `/fechar-pacote`:
- **Esquerda**: busca cliente → seleciona procedimento + qtde sessões → "Adicionar ao pacote" → forma de pagamento
- **Direita (sticky)**: lista de itens adicionados (com remover), campo desconto % (bloqueado por PIN admin = `settings.finance_pin`), total em dourado, botão Confirmar
- Backend: criar 1 `packages` por item adicionado, todos na mesma transação, todas sessões geradas

## 5. Campo `is_evaluator` em usuários

- Migração: `alter table users add column is_evaluator boolean default false`
- Formulário usuário (Profissional): toggle "É avaliadora de clientes?"
- `ClientFormModal`: dropdown Avaliadora filtra `role='admin' OR is_evaluator=true`

## 6. Responsividade

- `_authenticated.tsx`: sidebar vira Sheet (gaveta) em `md:hidden`
- Topbar mobile: botão hambúrguer abre Sheet
- Novo componente `BottomNav` fixo `md:hidden` com 5 ícones: Dashboard, Agenda, Clientes, Ficha, Financeiro
- Padding-bottom no `<main>` para não cobrir conteúdo (mobile)
- Revisar grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-N`
- Tabelas grandes: scroll horizontal em mobile

## 7. Scanner de Ficha com IA

- Botão "📷 Escanear ficha" em `/clientes`
- Modal: 2 uploads (frente obrigatória, verso opcional)
- Server function `scanClientCard.functions.ts` (createServerFn) chamando **Lovable AI Gateway** com modelo `google/gemini-2.5-pro` (multimodal, mais barato e rápido que Claude, sem precisar de API key externa). Extrai: nome, telefone residencial, telefone comercial, avaliadora, nº ficha, data, validade convênio, quantidade, tratamento, observações
- Retorna JSON via tool calling
- Modal mostra formulário pré-preenchido editável → salva via fluxo normal

**Pergunta importante (#7)**: você pediu Claude `claude-sonnet-4-20250514`, mas a plataforma já tem **Lovable AI Gateway** com modelos multimodais (Gemini 2.5 Pro, GPT-5) — sem precisar configurar API key da Anthropic, sem custo extra de setup. Posso usar Gemini 2.5 Pro? Se você fizer questão do Claude, vou precisar que adicione `ANTHROPIC_API_KEY` nos secrets.

## Ordem de execução

1. Migração SQL (índices + `is_evaluator`)
2. Sidebar com seções
3. Performance: otimizar queries das telas principais
4. Responsividade base (sheet + bottom nav)
5. Campo avaliadora (usuários + ClientForm)
6. Fechar Pacote redesenhado
7. Agenda multi-profissional
8. Scanner IA

Confirma? E sobre #7: **Lovable AI (Gemini) ou Claude com sua API key?**