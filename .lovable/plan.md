
# Plano — 11 melhorias no Beauty House

Tarefa grande, dividida em fases independentes. Antes de codar, quero alinhar **escopo e ordem de prioridade** para não passar horas em mudanças que você queira diferentes.

## Fase A — SQL (única migration, roda no SQL Editor)

```sql
-- app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_kiosk BOOLEAN DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- procedures (termo)
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS requires_term BOOLEAN DEFAULT false;
ALTER TABLE procedures ADD COLUMN IF NOT EXISTS term_text TEXT;

-- termos assinados
CREATE TABLE IF NOT EXISTS signed_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES packages(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  procedure_id UUID REFERENCES procedures(id),
  term_text TEXT NOT NULL,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON signed_terms TO authenticated;
ALTER TABLE signed_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON signed_terms FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- income (taxa de cartão)
ALTER TABLE income ADD COLUMN IF NOT EXISTS card_fee_pct NUMERIC DEFAULT 0;
ALTER TABLE income ADD COLUMN IF NOT EXISTS card_fee_payer TEXT;

-- appointments (avulso)
ALTER TABLE appointments ALTER COLUMN procedure_id DROP NOT NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pending_close BOOLEAN DEFAULT false;

-- support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_email TEXT,
  page TEXT,
  user_agent TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT,INSERT ON support_tickets TO authenticated;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth insert" ON support_tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth select" ON support_tickets FOR SELECT TO authenticated USING (true);
```

## Fase B — Mobile + Sidebar (itens 1 e 8)
- `Sidebar.tsx` / `BottomNav.tsx`: garantir botão **Sair** sempre visível no drawer mobile (atualmente está, mas vou verificar e reforçar no `BottomNav` o item Logout).
- `role=professional`: sidebar enxuta — header só "Beauty House" + itens permitidos. Sem cards admin. Topbar limpa (esconder sino de notificação/estoque se sem permissão — já é o caso pela permissão, vou validar).

## Fase C — Kiosk de Ponto (item 2)
- Detectar `user.is_kiosk` no `_authenticated.tsx` → renderiza apenas `/kiosk-ponto` (nova rota), bloqueia sidebar/outras rotas.
- `kiosk-ponto.tsx`: tela "Identifique-se" com busca em `app_users` por nome/email/cpf/login. Mostra cards com avatar + nome + cargo → "Sou eu" → 4 botões de ponto (mesma lógica de `meu-ponto.tsx`, mas inserindo com `user_id` selecionado via server fn que usa `supabaseAdmin`) → volta para tela inicial com toast.
- `meu-ponto.tsx`: tornar read-only (sem botões), apenas histórico do próprio usuário.

## Fase D — Taxa de Cartão (item 3)
- `fechar-pacote.tsx`: quando `payMethod` começa com "Cartão", exibir campo `card_fee_pct` + radio `card_fee_payer` (Empresa/Cliente).
  - Empresa: total recebido = total × (1-fee); cria `income` com valor líquido + `expense` "Taxa de cartão" com a diferença.
  - Cliente: total cobrado = total × (1+fee); cria `income` com valor cheio.
- Salvar `card_fee_pct` e `card_fee_payer` no income. ContractModal e Histórico $ exibem essas infos.

## Fase E — Agendamento Avulso (itens 4 e 6)
- `agenda.tsx` modal `+ Agendar`: `procedure_id` opcional → permite "A definir".
- Status novo `pending_close`. Ao marcar "Realizado", se sem `procedure_id` ou flag, abre modal Fechar Pacote dentro da agenda.
- Revisar query de carregamento: usar `select("*")` sem inner join obrigatório com `sessions`, range amplo da semana visível, sem filtro de procedure_id.

## Fase F — Agenda visual 22min (item 11)
- Slots: gerar array de 07:00 → ~21:00 em passos de 22min.
- Cada linha 40px (ajustável). Linhas horizontais com `border-bottom: 1px solid #cbd5e1` (cinza médio); linhas em hora cheia `border-bottom: 1.5px solid #94a3b8`.
- Cards de agendamento posicionados/proporcionais à duração.

## Fase G — Termos (item 5)
- `procedimentos.tsx`: checkbox `requires_term` + textarea `term_text`.
- `SessionsTab.tsx`: ao confirmar PRIMEIRA sessão de pacote com proc.requires_term, exibir modal com texto + canvas. Salva em `signed_terms`. Botão "Ver termo" na ficha.

## Fase H — Cliente já existente: adicionar procedimento (item 9)
- `ClientFormModal.tsx` ou `clientes.$id.tsx`: botão "+ Adicionar procedimento que a cliente já possui" → modal compacto (procedimento, sessões feitas, total). Cria package `origin='ficha_importada'`, sessions correspondentes, sem income. Mesma lógica já existente no Scan-ficha.

## Fase I — Reportar Problema (item 7)
- Componente flutuante `<ReportProblemFAB>` em `_authenticated.tsx`. Modal → insere `support_tickets` + chama server fn que envia email via Lovable Emails (ou Resend se já configurado) para `juliocesar.fonseca2000@gmail.com`.
  - **Pergunta:** você quer email mesmo? Se sim, preciso confirmar se Lovable Emails já está configurado neste projeto, ou se devo só salvar no banco + você consulta uma tela admin de tickets.

## Itens transversais (10)
- Tudo encaixa: agendamento avulso → fechar → packages/sessions/income; taxa → income+expense; termo → signed_terms ligado a package; cliente existente → packages ficha_importada visível em sessions/prontuário.

---

## ⚠️ Perguntas críticas antes de começar

1. **Tamanho:** isso são ~15 arquivos editados + 3-5 arquivos novos + 1 migration. Você quer **tudo de uma vez** ou prefere que eu faça em 2-3 entregas (ex: fases A-D primeiro, depois E-I)? Em um único turno o risco de quebrar algo é maior.
2. **Reportar Problema (item 7):** envio de email exige configurar provedor. Posso (a) só salvar no banco e te mostro listagem, (b) usar Lovable Emails (precisa configurar domínio), (c) Resend (precisa API key). Qual?
3. **Kiosk (item 2):** a conta `ponto@beautyhouse.com` já existe no `app_users` com `is_kiosk=true`? Ou preciso só adicionar a coluna e te dar o SQL para você setar manualmente?
4. **Agenda 22min:** confirmar — você quer mesmo **22 minutos** (não 20 nem 30)? E faixa **07:00 até 21:00**?

Me confirma essas 4 perguntas e o ritmo que prefere, e eu começo pela Fase A (migration) + as fases que você priorizar.
