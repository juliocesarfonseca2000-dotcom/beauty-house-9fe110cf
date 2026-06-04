import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  IconPlus,
  IconTrash,
  IconLock,
  IconCash,
  IconReceipt2,
  IconChartPie,
  IconCalendar,
  IconFileDownload,
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { exportFinanceiroPdf } from "@/lib/pdf-export";

export const Route = createFileRoute("/_authenticated/financeiro")({
  component: FinanceiroPage,
});

type Income = {
  id: string;
  client_id: string | null;
  package_id: string | null;
  description: string | null;
  amount: number;
  discount_val: number | null;
  pay_method: string | null;
  date: string;
};

type Expense = {
  id: string;
  category: string | null;
  description: string | null;
  amount: number;
  date: string;
};

type Tab = "receitas" | "despesas" | "fechamento";

const PAY_METHODS = ["Dinheiro", "PIX", "Débito", "Crédito 1x", "Crédito Parcelado", "Transferência"];
const EXPENSE_CATEGORIES = [
  "Aluguel",
  "Energia",
  "Água",
  "Internet",
  "Folha",
  "Produtos",
  "Marketing",
  "Manutenção",
  "Impostos",
  "Outros",
];

function fmtMoney(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function FinanceiroPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [storedPin, setStoredPin] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("settings")
      .select("finance_pin")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setStoredPin(data?.finance_pin ?? "1234"));
  }, []);

  if (!unlocked) {
    return (
      <div className="bh-card p-12 max-w-md mx-auto mt-12 text-center">
        <IconLock size={42} className="mx-auto text-gold" />
        <div className="font-display text-2xl text-navy mt-3">Financeiro Protegido</div>
        <div className="text-text3 text-sm mt-1">Digite o PIN para acessar.</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pinInput === storedPin) {
              setUnlocked(true);
              setPinInput("");
            } else {
              toast.error("PIN incorreto");
              setPinInput("");
            }
          }}
          className="mt-6 space-y-3"
        >
          <input
            type="password"
            autoFocus
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="bh-input text-center text-2xl tracking-[0.5em] font-mono"
            maxLength={8}
            placeholder="••••"
          />
          <button type="submit" className="bh-btn bh-btn-primary w-full">
            Desbloquear
          </button>
        </form>
      </div>
    );
  }

  return <FinanceiroUnlocked />;
}

function FinanceiroUnlocked() {
  const [tab, setTab] = useState<Tab>("receitas");
  return (
    <div className="space-y-4">
      <div className="bh-card p-2 inline-flex gap-1">
        {(
          [
            { id: "receitas", label: "Receitas", icon: <IconCash size={16} /> },
            { id: "despesas", label: "Despesas", icon: <IconReceipt2 size={16} /> },
            { id: "fechamento", label: "Fechamento", icon: <IconChartPie size={16} /> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
              tab === t.id ? "bg-navy text-white" : "text-text2 hover:bg-bg2"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "receitas" && <ReceitasTab />}
      {tab === "despesas" && <DespesasTab />}
      {tab === "fechamento" && <FechamentoTab />}
    </div>
  );
}

// ============= RECEITAS =============

function ReceitasTab() {
  const [items, setItems] = useState<Income[]>([]);
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("income")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Income[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.amount ?? 0), 0), [items]);
  const totalDiscount = useMemo(
    () => items.reduce((s, i) => s + Number(i.discount_val ?? 0), 0),
    [items],
  );

  async function remove(id: string) {
    if (!confirm("Excluir esta receita?")) return;
    const { error } = await supabase.from("income").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Receita excluída");
    load();
  }

  return (
    <>
      <div className="bh-card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-text3 mb-1">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bh-input"
          />
        </div>
        <div>
          <label className="block text-xs text-text3 mb-1">Até</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bh-input" />
        </div>
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-xs text-text3">Total</div>
          <div className="font-display text-2xl text-success">{fmtMoney(total)}</div>
          {totalDiscount > 0 && (
            <div className="text-xs text-text3">Descontos: {fmtMoney(totalDiscount)}</div>
          )}
        </div>
        <button onClick={() => setShowForm(true)} className="bh-btn bh-btn-primary">
          <IconPlus size={16} /> Nova receita
        </button>
      </div>

      <div className="bh-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg2 text-text3">
            <tr>
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Descrição</th>
              <th className="text-left p-3">Pagamento</th>
              <th className="text-right p-3">Desconto</th>
              <th className="text-right p-3">Valor</th>
              <th className="p-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-text3">
                  Carregando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-text3">
                  Nenhuma receita no período.
                </td>
              </tr>
            ) : (
              items.map((i) => (
                <tr key={i.id} className="border-t border-border hover:bg-bg2/50">
                  <td className="p-3">{new Date(i.date).toLocaleDateString("pt-BR")}</td>
                  <td className="p-3">{i.description || "—"}</td>
                  <td className="p-3">{i.pay_method || "—"}</td>
                  <td className="p-3 text-right text-text3">{fmtMoney(Number(i.discount_val ?? 0))}</td>
                  <td className="p-3 text-right font-semibold text-success">
                    {fmtMoney(Number(i.amount))}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => remove(i.id)}
                      className="text-text3 hover:text-danger p-1"
                      title="Excluir"
                    >
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <IncomeFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </>
  );
}

function IncomeFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [discount, setDiscount] = useState<string>("");
  const [payMethod, setPayMethod] = useState(PAY_METHODS[0]);
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) return toast.error("Informe um valor válido");
    setSaving(true);
    const { error } = await supabase.from("income").insert({
      description: description || null,
      amount: value,
      discount_val: discount ? Number(discount.replace(",", ".")) : 0,
      pay_method: payMethod,
      date,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Receita lançada");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={save} className="bh-card p-6 w-full max-w-md space-y-4">
        <div className="font-display text-xl text-navy">Nova receita</div>
        <div>
          <label className="block text-xs text-text3 mb-1">Descrição</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bh-input"
            placeholder="Ex: Venda avulsa"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text3 mb-1">Valor (R$)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bh-input"
              required
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="block text-xs text-text3 mb-1">Desconto (R$)</label>
            <input
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="bh-input"
              inputMode="decimal"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text3 mb-1">Pagamento</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="bh-input"
            >
              {PAY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text3 mb-1">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bh-input"
              required
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="bh-btn">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="bh-btn bh-btn-primary">
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============= DESPESAS =============

function DespesasTab() {
  const [items, setItems] = useState<Expense[]>([]);
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Expense[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.amount ?? 0), 0), [items]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((i) => {
      const k = i.category || "Outros";
      m.set(k, (m.get(k) ?? 0) + Number(i.amount ?? 0));
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  async function remove(id: string) {
    if (!confirm("Excluir esta despesa?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Despesa excluída");
    load();
  }

  return (
    <>
      <div className="bh-card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-text3 mb-1">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bh-input"
          />
        </div>
        <div>
          <label className="block text-xs text-text3 mb-1">Até</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bh-input" />
        </div>
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-xs text-text3">Total</div>
          <div className="font-display text-2xl text-danger">{fmtMoney(total)}</div>
        </div>
        <button onClick={() => setShowForm(true)} className="bh-btn bh-btn-primary">
          <IconPlus size={16} /> Nova despesa
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bh-card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text3">
              <tr>
                <th className="text-left p-3">Data</th>
                <th className="text-left p-3">Categoria</th>
                <th className="text-left p-3">Descrição</th>
                <th className="text-right p-3">Valor</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-text3">
                    Carregando…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-text3">
                    Nenhuma despesa no período.
                  </td>
                </tr>
              ) : (
                items.map((i) => (
                  <tr key={i.id} className="border-t border-border hover:bg-bg2/50">
                    <td className="p-3">{new Date(i.date).toLocaleDateString("pt-BR")}</td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-bg2 text-text2 text-xs">
                        {i.category || "—"}
                      </span>
                    </td>
                    <td className="p-3">{i.description || "—"}</td>
                    <td className="p-3 text-right font-semibold text-danger">
                      {fmtMoney(Number(i.amount))}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => remove(i.id)}
                        className="text-text3 hover:text-danger p-1"
                      >
                        <IconTrash size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bh-card p-4">
          <div className="font-display text-lg text-navy mb-3">Por categoria</div>
          {byCategory.length === 0 ? (
            <div className="text-sm text-text3">Sem dados.</div>
          ) : (
            <div className="space-y-2">
              {byCategory.map(([cat, val]) => {
                const pct = total > 0 ? (val / total) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm">
                      <span className="text-text2">{cat}</span>
                      <span className="font-semibold">{fmtMoney(val)}</span>
                    </div>
                    <div className="h-1.5 bg-bg2 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <ExpenseFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </>
  );
}

function ExpenseFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) return toast.error("Informe um valor válido");
    setSaving(true);
    const { error } = await supabase.from("expenses").insert({
      category,
      description: description || null,
      amount: value,
      date,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Despesa lançada");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={save} className="bh-card p-6 w-full max-w-md space-y-4">
        <div className="font-display text-xl text-navy">Nova despesa</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text3 mb-1">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bh-input"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text3 mb-1">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bh-input"
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-text3 mb-1">Descrição</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bh-input"
            placeholder="Ex: Conta de luz mar/26"
          />
        </div>
        <div>
          <label className="block text-xs text-text3 mb-1">Valor (R$)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bh-input"
            required
            inputMode="decimal"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="bh-btn">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="bh-btn bh-btn-primary">
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============= FECHAMENTO =============

function FechamentoTab() {
  const [mode, setMode] = useState<"day" | "month">("day");
  const [day, setDay] = useState(todayStr());
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [income, setIncome] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    let from: string, to: string;
    if (mode === "day") {
      from = day;
      to = day;
    } else {
      const [y, m] = month.split("-").map(Number);
      from = `${month}-01`;
      to = new Date(y, m, 0).toISOString().slice(0, 10);
    }
    const [{ data: inc }, { data: exp }] = await Promise.all([
      supabase.from("income").select("*").gte("date", from).lte("date", to),
      supabase.from("expenses").select("*").gte("date", from).lte("date", to),
    ]);
    setIncome((inc ?? []) as Income[]);
    setExpenses((exp ?? []) as Expense[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, day, month]);

  const totalIn = useMemo(() => income.reduce((s, i) => s + Number(i.amount ?? 0), 0), [income]);
  const totalOut = useMemo(
    () => expenses.reduce((s, i) => s + Number(i.amount ?? 0), 0),
    [expenses],
  );
  const result = totalIn - totalOut;

  const byMethod = useMemo(() => {
    const m = new Map<string, number>();
    income.forEach((i) => {
      const k = i.pay_method || "—";
      m.set(k, (m.get(k) ?? 0) + Number(i.amount ?? 0));
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [income]);

  return (
    <>
      <div className="bh-card p-4 flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-md overflow-hidden border border-border">
          <button
            onClick={() => setMode("day")}
            className={`px-4 py-2 text-sm flex items-center gap-2 ${
              mode === "day" ? "bg-navy text-white" : "bg-card text-text2"
            }`}
          >
            <IconCalendar size={14} /> Diário
          </button>
          <button
            onClick={() => setMode("month")}
            className={`px-4 py-2 text-sm flex items-center gap-2 ${
              mode === "month" ? "bg-navy text-white" : "bg-card text-text2"
            }`}
          >
            <IconCalendar size={14} /> Mensal
          </button>
        </div>
        {mode === "day" ? (
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="bh-input"
          />
        ) : (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bh-input"
          />
        )}
        <div className="flex-1" />
        {loading && <span className="text-xs text-text3">Carregando…</span>}
        <button
          onClick={() => {
            const fromLabel = mode === "day" ? day : `${month}-01`;
            const toLabel = mode === "day"
              ? day
              : (() => { const [y, m] = month.split("-").map(Number); return new Date(y, m, 0).toISOString().slice(0, 10); })();
            exportFinanceiroPdf({
              fromLabel, toLabel,
              includeIncome: true, includeExpenses: true, includeResult: true,
              incomes: income.map((i) => ({ date: i.date, description: i.description, pay_method: i.pay_method, amount: Number(i.amount ?? 0) })),
              expenses: expenses.map((e) => ({ date: e.date, category: e.category ?? null, description: e.description ?? null, amount: Number(e.amount ?? 0) })),
            });
          }}
          className="bh-btn bh-btn-primary"
          title="Exportar PDF do fechamento"
        >
          <IconFileDownload size={16} /> Exportar PDF
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bh-card p-5">
          <div className="text-xs text-text3 uppercase tracking-wide">Receitas</div>
          <div className="font-display text-3xl text-success mt-1">{fmtMoney(totalIn)}</div>
          <div className="text-xs text-text3 mt-1">{income.length} lançamentos</div>
        </div>
        <div className="bh-card p-5">
          <div className="text-xs text-text3 uppercase tracking-wide">Despesas</div>
          <div className="font-display text-3xl text-danger mt-1">{fmtMoney(totalOut)}</div>
          <div className="text-xs text-text3 mt-1">{expenses.length} lançamentos</div>
        </div>
        <div className="bh-card p-5">
          <div className="text-xs text-text3 uppercase tracking-wide">Resultado</div>
          <div
            className={`font-display text-3xl mt-1 ${result >= 0 ? "text-success" : "text-danger"}`}
          >
            {fmtMoney(result)}
          </div>
          <div className="text-xs text-text3 mt-1">
            Margem: {totalIn > 0 ? `${((result / totalIn) * 100).toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      <div className="bh-card p-5">
        <div className="font-display text-lg text-navy mb-3">Receitas por forma de pagamento</div>
        {byMethod.length === 0 ? (
          <div className="text-sm text-text3">Sem receitas no período.</div>
        ) : (
          <div className="space-y-2">
            {byMethod.map(([m, v]) => {
              const pct = totalIn > 0 ? (v / totalIn) * 100 : 0;
              return (
                <div key={m}>
                  <div className="flex justify-between text-sm">
                    <span className="text-text2">{m}</span>
                    <span className="font-semibold">
                      {fmtMoney(v)} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-bg2 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
