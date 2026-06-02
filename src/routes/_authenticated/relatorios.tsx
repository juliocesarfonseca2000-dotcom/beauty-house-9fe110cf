import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  IconChartBar,
  IconUsers,
  IconAlertTriangle,
  IconTrendingUp,
  IconDownload,
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
});

type Tab = "faturamento" | "produtividade" | "estoque" | "clientes";

function fmtMoney(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function firstDayOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function RelatoriosPage() {
  const [tab, setTab] = useState<Tab>("faturamento");
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "faturamento", label: "Faturamento", icon: <IconChartBar size={16} /> },
    { id: "produtividade", label: "Produtividade", icon: <IconTrendingUp size={16} /> },
    { id: "estoque", label: "Estoque crítico", icon: <IconAlertTriangle size={16} /> },
    { id: "clientes", label: "Evolução de clientes", icon: <IconUsers size={16} /> },
  ];
  return (
    <div className="space-y-4">
      <div className="bh-card p-2 inline-flex gap-1 flex-wrap">
        {tabs.map((t) => (
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
      {tab === "faturamento" && <FaturamentoReport />}
      {tab === "produtividade" && <ProdutividadeReport />}
      {tab === "estoque" && <EstoqueReport />}
      {tab === "clientes" && <ClientesReport />}
    </div>
  );
}

// ============= FATURAMENTO =============
function FaturamentoReport() {
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(todayStr());
  const [income, setIncome] = useState<{ date: string; amount: number; pay_method: string | null }[]>(
    [],
  );
  const [expenses, setExpenses] = useState<{ date: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: inc }, { data: exp }] = await Promise.all([
      supabase.from("income").select("date,amount,pay_method").gte("date", from).lte("date", to),
      supabase.from("expenses").select("date,amount").gte("date", from).lte("date", to),
    ]);
    setIncome((inc ?? []) as { date: string; amount: number; pay_method: string | null }[]);
    setExpenses((exp ?? []) as { date: string; amount: number }[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totalIn = useMemo(() => income.reduce((s, i) => s + Number(i.amount ?? 0), 0), [income]);
  const totalOut = useMemo(
    () => expenses.reduce((s, i) => s + Number(i.amount ?? 0), 0),
    [expenses],
  );
  const result = totalIn - totalOut;

  const byDay = useMemo(() => {
    const m = new Map<string, { inc: number; exp: number }>();
    income.forEach((i) => {
      const k = i.date;
      const cur = m.get(k) ?? { inc: 0, exp: 0 };
      cur.inc += Number(i.amount ?? 0);
      m.set(k, cur);
    });
    expenses.forEach((i) => {
      const k = i.date;
      const cur = m.get(k) ?? { inc: 0, exp: 0 };
      cur.exp += Number(i.amount ?? 0);
      m.set(k, cur);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [income, expenses]);

  const maxBar = useMemo(
    () => Math.max(1, ...byDay.map(([, v]) => Math.max(v.inc, v.exp))),
    [byDay],
  );

  function exportCsv() {
    const rows: (string | number)[][] = [["Data", "Receitas", "Despesas", "Resultado"]];
    byDay.forEach(([d, v]) => rows.push([d, v.inc.toFixed(2), v.exp.toFixed(2), (v.inc - v.exp).toFixed(2)]));
    rows.push(["TOTAL", totalIn.toFixed(2), totalOut.toFixed(2), result.toFixed(2)]);
    downloadCsv(`faturamento_${from}_${to}.csv`, rows);
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
        <button onClick={exportCsv} className="bh-btn">
          <IconDownload size={16} /> Exportar CSV
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bh-card p-5">
          <div className="text-xs text-text3 uppercase">Receitas</div>
          <div className="font-display text-3xl text-success mt-1">{fmtMoney(totalIn)}</div>
        </div>
        <div className="bh-card p-5">
          <div className="text-xs text-text3 uppercase">Despesas</div>
          <div className="font-display text-3xl text-danger mt-1">{fmtMoney(totalOut)}</div>
        </div>
        <div className="bh-card p-5">
          <div className="text-xs text-text3 uppercase">Resultado</div>
          <div
            className={`font-display text-3xl mt-1 ${result >= 0 ? "text-success" : "text-danger"}`}
          >
            {fmtMoney(result)}
          </div>
        </div>
      </div>

      <div className="bh-card p-5">
        <div className="font-display text-lg text-navy mb-4">Evolução diária</div>
        {loading ? (
          <div className="text-sm text-text3">Carregando…</div>
        ) : byDay.length === 0 ? (
          <div className="text-sm text-text3">Sem dados no período.</div>
        ) : (
          <div className="space-y-1.5">
            {byDay.map(([d, v]) => (
              <div key={d} className="grid grid-cols-[90px_1fr_120px] items-center gap-3 text-xs">
                <span className="text-text3">{new Date(d).toLocaleDateString("pt-BR")}</span>
                <div className="space-y-1">
                  <div className="h-2 bg-bg2 rounded-full overflow-hidden">
                    <div className="h-full bg-success" style={{ width: `${(v.inc / maxBar) * 100}%` }} />
                  </div>
                  <div className="h-2 bg-bg2 rounded-full overflow-hidden">
                    <div className="h-full bg-danger" style={{ width: `${(v.exp / maxBar) * 100}%` }} />
                  </div>
                </div>
                <span className="text-right font-mono">
                  <span className="text-success">{fmtMoney(v.inc)}</span>
                  {v.exp > 0 && <span className="text-danger ml-2">-{fmtMoney(v.exp)}</span>}
                </span>
              </div>
            ))}
            <div className="flex gap-4 text-xs text-text3 pt-3">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 bg-success rounded-sm" /> Receitas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 bg-danger rounded-sm" /> Despesas
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ============= PRODUTIVIDADE =============
function ProdutividadeReport() {
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(todayStr());
  const [rows, setRows] = useState<{ name: string; sessions: number; appointments: number }[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const fromTs = `${from}T00:00:00`;
    const toTs = `${to}T23:59:59`;
    const [{ data: users }, { data: sessions }, { data: appts }] = await Promise.all([
      supabase.from("app_users").select("id,name,active").eq("active", true),
      supabase
        .from("sessions")
        .select("professional_id,done_at,status")
        .eq("status", "done")
        .gte("done_at", fromTs)
        .lte("done_at", toTs),
      supabase
        .from("appointments")
        .select("professional_id,datetime")
        .gte("datetime", fromTs)
        .lte("datetime", toTs),
    ]);
    const sessByProf = new Map<string, number>();
    (sessions ?? []).forEach((s: { professional_id: string | null }) => {
      if (!s.professional_id) return;
      sessByProf.set(s.professional_id, (sessByProf.get(s.professional_id) ?? 0) + 1);
    });
    const apptByProf = new Map<string, number>();
    (appts ?? []).forEach((a: { professional_id: string | null }) => {
      if (!a.professional_id) return;
      apptByProf.set(a.professional_id, (apptByProf.get(a.professional_id) ?? 0) + 1);
    });
    const out = ((users ?? []) as { id: string; name: string }[])
      .map((u) => ({
        name: u.name,
        sessions: sessByProf.get(u.id) ?? 0,
        appointments: apptByProf.get(u.id) ?? 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);
    setRows(out);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totalSess = rows.reduce((s, r) => s + r.sessions, 0);
  const max = Math.max(1, ...rows.map((r) => r.sessions));

  function exportCsv() {
    const data: (string | number)[][] = [["Profissional", "Sessões realizadas", "Agendamentos"]];
    rows.forEach((r) => data.push([r.name, r.sessions, r.appointments]));
    downloadCsv(`produtividade_${from}_${to}.csv`, data);
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
          <div className="text-xs text-text3">Sessões no período</div>
          <div className="font-display text-2xl text-navy">{totalSess}</div>
        </div>
        <button onClick={exportCsv} className="bh-btn">
          <IconDownload size={16} /> CSV
        </button>
      </div>

      <div className="bh-card p-5">
        {loading ? (
          <div className="text-sm text-text3">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-text3">Sem profissionais ativos.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.name}>
                <div className="flex justify-between text-sm">
                  <span className="text-text1 font-medium">{r.name}</span>
                  <span className="text-text3">
                    <span className="text-navy font-semibold">{r.sessions}</span> sessões ·{" "}
                    {r.appointments} agendamentos
                  </span>
                </div>
                <div className="h-2 bg-bg2 rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-gold"
                    style={{ width: `${(r.sessions / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ============= ESTOQUE CRÍTICO =============
function EstoqueReport() {
  const [rows, setRows] = useState<
    { id: string; name: string; category: string | null; qty_current: number; qty_min: number }[]
  >([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id,name,category,qty_current,qty_min,active")
      .eq("active", true)
      .order("name");
    if (error) toast.error(error.message);
    setRows((data ?? []) as typeof rows);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const critical = rows.filter((r) => Number(r.qty_current) <= Number(r.qty_min));
  const ok = rows.filter((r) => Number(r.qty_current) > Number(r.qty_min));

  function exportCsv() {
    const data: (string | number)[][] = [["Produto", "Categoria", "Estoque atual", "Mínimo", "Falta"]];
    critical.forEach((r) =>
      data.push([
        r.name,
        r.category ?? "",
        r.qty_current,
        r.qty_min,
        Math.max(0, Number(r.qty_min) - Number(r.qty_current)),
      ]),
    );
    downloadCsv(`estoque_critico_${todayStr()}.csv`, data);
  }

  return (
    <>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bh-card p-5">
          <div className="text-xs text-text3 uppercase">Produtos ativos</div>
          <div className="font-display text-3xl text-navy mt-1">{rows.length}</div>
        </div>
        <div className="bh-card p-5">
          <div className="text-xs text-text3 uppercase">No mínimo / abaixo</div>
          <div className="font-display text-3xl text-danger mt-1">{critical.length}</div>
        </div>
        <div className="bh-card p-5">
          <div className="text-xs text-text3 uppercase">Saudáveis</div>
          <div className="font-display text-3xl text-success mt-1">{ok.length}</div>
        </div>
      </div>

      <div className="bh-card p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="font-display text-lg text-navy">Produtos críticos</div>
          <button onClick={exportCsv} className="bh-btn" disabled={critical.length === 0}>
            <IconDownload size={16} /> CSV
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-bg2 text-text3">
            <tr>
              <th className="text-left p-3">Produto</th>
              <th className="text-left p-3">Categoria</th>
              <th className="text-right p-3">Estoque</th>
              <th className="text-right p-3">Mínimo</th>
              <th className="text-right p-3">Falta</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-text3">
                  Carregando…
                </td>
              </tr>
            ) : critical.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-success">
                  Todos os produtos estão acima do mínimo.
                </td>
              </tr>
            ) : (
              critical.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3 text-text3">{r.category ?? "—"}</td>
                  <td className="p-3 text-right text-danger font-semibold">{r.qty_current}</td>
                  <td className="p-3 text-right">{r.qty_min}</td>
                  <td className="p-3 text-right">
                    {Math.max(0, Number(r.qty_min) - Number(r.qty_current))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============= EVOLUÇÃO DE CLIENTES =============
function ClientesReport() {
  const [months, setMonths] = useState(6);
  const [data, setData] = useState<{ label: string; count: number }[]>([]);
  const [top, setTop] = useState<{ name: string; sessions: number; spent: number }[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const start = new Date();
    start.setMonth(start.getMonth() - (months - 1));
    start.setDate(1);
    const startStr = start.toISOString().slice(0, 10);

    const [{ data: clients }, { data: sessions }, { data: income }] = await Promise.all([
      supabase.from("clients").select("created_at").gte("created_at", startStr),
      supabase.from("sessions").select("client_id").eq("status", "done"),
      supabase.from("income").select("client_id,amount"),
    ]);

    // novos clientes por mês
    const buckets = new Map<string, number>();
    for (let i = 0; i < months; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const k = d.toISOString().slice(0, 7);
      buckets.set(k, 0);
    }
    (clients ?? []).forEach((c: { created_at: string }) => {
      const k = c.created_at.slice(0, 7);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    });
    setData(
      Array.from(buckets.entries()).map(([k, v]) => ({
        label: new Date(`${k}-01`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        count: v,
      })),
    );

    // top clientes por sessões + gasto
    const sessByClient = new Map<string, number>();
    (sessions ?? []).forEach((s: { client_id: string | null }) => {
      if (!s.client_id) return;
      sessByClient.set(s.client_id, (sessByClient.get(s.client_id) ?? 0) + 1);
    });
    const spentByClient = new Map<string, number>();
    (income ?? []).forEach((i: { client_id: string | null; amount: number }) => {
      if (!i.client_id) return;
      spentByClient.set(i.client_id, (spentByClient.get(i.client_id) ?? 0) + Number(i.amount ?? 0));
    });
    const ids = Array.from(new Set([...sessByClient.keys(), ...spentByClient.keys()]));
    if (ids.length > 0) {
      const { data: cli } = await supabase.from("clients").select("id,name").in("id", ids);
      const byId = new Map((cli ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
      const list = ids
        .map((id) => ({
          name: byId.get(id) ?? "—",
          sessions: sessByClient.get(id) ?? 0,
          spent: spentByClient.get(id) ?? 0,
        }))
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 10);
      setTop(list);
    } else {
      setTop([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  const max = Math.max(1, ...data.map((d) => d.count));
  const totalNew = data.reduce((s, d) => s + d.count, 0);

  return (
    <>
      <div className="bh-card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-text3 mb-1">Período</label>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="bh-input"
          >
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
          </select>
        </div>
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-xs text-text3">Novos clientes</div>
          <div className="font-display text-2xl text-navy">{totalNew}</div>
        </div>
      </div>

      <div className="bh-card p-5">
        <div className="font-display text-lg text-navy mb-4">Novos clientes por mês</div>
        {loading ? (
          <div className="text-sm text-text3">Carregando…</div>
        ) : (
          <div className="flex items-end gap-2 h-48">
            {data.map((d) => (
              <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-2">
                <div className="text-xs font-mono text-text2">{d.count}</div>
                <div
                  className="w-full bg-gold rounded-t-md transition-all"
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 0 }}
                />
                <div className="text-[11px] text-text3 capitalize">{d.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bh-card p-0 overflow-hidden">
        <div className="p-4 border-b border-border font-display text-lg text-navy">
          Top 10 clientes (por valor gasto)
        </div>
        <table className="w-full text-sm">
          <thead className="bg-bg2 text-text3">
            <tr>
              <th className="text-left p-3 w-10">#</th>
              <th className="text-left p-3">Cliente</th>
              <th className="text-right p-3">Sessões realizadas</th>
              <th className="text-right p-3">Total gasto</th>
            </tr>
          </thead>
          <tbody>
            {top.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-text3">
                  Sem dados ainda.
                </td>
              </tr>
            ) : (
              top.map((c, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-3 text-text3">{i + 1}</td>
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-right">{c.sessions}</td>
                  <td className="p-3 text-right font-semibold text-success">{fmtMoney(c.spent)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
