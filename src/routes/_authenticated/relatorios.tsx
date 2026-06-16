import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  IconCake,
  IconUserOff,
  IconPackage,
  IconAlertTriangle,
  IconTrendingUp,
  IconCrown,
  IconBrandWhatsapp,
  IconDownload,
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: RelatoriosPage,
});

type Tab =
  | "aniversariantes"
  | "inativos"
  | "pacotes"
  | "estoque"
  | "produtividade"
  | "topclientes";

function fmtMoney(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function copyWhatsApp(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copiado! Cole no WhatsApp."),
    () => toast.error("Não foi possível copiar."),
  );
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
  const [tab, setTab] = useState<Tab>("aniversariantes");
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "aniversariantes", label: "Aniversariantes", icon: <IconCake size={16} /> },
    { id: "inativos", label: "Clientes inativos", icon: <IconUserOff size={16} /> },
    { id: "pacotes", label: "Pacotes a vencer", icon: <IconPackage size={16} /> },
    { id: "estoque", label: "Estoque crítico", icon: <IconAlertTriangle size={16} /> },
    { id: "produtividade", label: "Produtividade", icon: <IconTrendingUp size={16} /> },
    { id: "topclientes", label: "Top clientes", icon: <IconCrown size={16} /> },
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
      {tab === "aniversariantes" && <AniversariantesReport />}
      {tab === "inativos" && <InativosReport />}
      {tab === "pacotes" && <PacotesReport />}
      {tab === "estoque" && <EstoqueReport />}
      {tab === "produtividade" && <ProdutividadeReport />}
      {tab === "topclientes" && <TopClientesReport />}
    </div>
  );
}

function WhatsBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        borderColor: "#25D366",
        color: "#25D366",
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = "rgba(37, 211, 102, 0.10)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
      title="Enviar mensagem por WhatsApp"
    >
      <IconBrandWhatsapp size={16} /> Enviar por WhatsApp
    </button>
  );
}

function ReportHeader({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <div className="bh-card p-4 flex flex-wrap items-end gap-3">
      <div>
        <div className="font-display text-lg text-navy">{title}</div>
        {typeof count === "number" && (
          <div className="text-xs text-text3 mt-0.5">{count} registro(s)</div>
        )}
      </div>
      <div className="flex-1" />
      {children}
    </div>
  );
}

// ============= 1. ANIVERSARIANTES DO MÊS =============
function AniversariantesReport() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [rows, setRows] = useState<{ id: string; name: string; phone: string | null; birthdate: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const pad = String(month).padStart(2, "0");
      const lastDay = new Date(2000, Number(pad), 0).getDate();
      const lastDayPad = String(lastDay).padStart(2, "0");
      const { data, error } = await supabase
        .from("clients")
        .select("id,name,phone,birthdate,record_num")
        .eq("active", true)
        .not("birthdate", "is", null)
        .gte("birthdate", `1900-${pad}-01`)
        .lte("birthdate", `2099-${pad}-${lastDayPad}`)
        .order("birthdate");
      if (error) toast.error(error.message);
      const sorted = ((data ?? []) as { id: string; name: string; phone: string | null; birthdate: string }[])
        .sort((a, b) => a.birthdate.slice(8, 10).localeCompare(b.birthdate.slice(8, 10)));
      setRows(sorted as typeof rows);
      setLoading(false);
    })();
  }, [month]);


  const monthName = new Date(2000, month - 1, 1).toLocaleDateString("pt-BR", { month: "long" });

  function whats() {
    const lines = [
      `🎂 *Aniversariantes de ${monthName}* — Beauty House\n`,
      ...rows.map((r) => `• ${r.name} — ${r.birthdate.slice(8, 10)}/${r.birthdate.slice(5, 7)}${r.phone ? ` — ${r.phone}` : ""}`),
    ];
    copyWhatsApp(lines.join("\n"));
  }

  return (
    <>
      <ReportHeader title={`Aniversariantes de ${monthName}`} count={rows.length}>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bh-input">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {new Date(2000, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" })}
            </option>
          ))}
        </select>
        <WhatsBtn onClick={whats} disabled={rows.length === 0} />
      </ReportHeader>
      <div className="bh-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg2 text-text3">
            <tr>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">Aniversário</th>
              <th className="text-left p-3">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="p-6 text-center text-text3">Carregando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={3} className="p-6 text-center text-text3">Nenhuma cliente aniversaria em {monthName}.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3">{r.birthdate.slice(8, 10)}/{r.birthdate.slice(5, 7)}</td>
                <td className="p-3 text-text2">{r.phone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============= 2. CLIENTES INATIVOS (seções +30 e +60) =============
type InativoRow = {
  id: string;
  name: string;
  phone: string | null;
  last: string | null;
  last_proc: string | null;
};

function InativosReport() {
  const [r30, setR30] = useState<InativoRow[]>([]);
  const [r60, setR60] = useState<InativoRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = new Date();
      const c30 = new Date(today); c30.setDate(c30.getDate() - 30);
      const c60 = new Date(today); c60.setDate(c60.getDate() - 60);
      const c30s = c30.toISOString().slice(0, 10);
      const c60s = c60.toISOString().slice(0, 10);

      const [{ data: clients }, { data: sessions }] = await Promise.all([
        supabase.from("clients").select("id,name,phone").eq("active", true).limit(500),
        supabase
          .from("sessions")
          .select("client_id,done_at,packages(procedures(name))")
          .not("done_at", "is", null)
          .eq("status", "done")
          .limit(500),
      ]);

      type SessRow = {
        client_id: string | null;
        done_at: string;
        packages: { procedures: { name: string } | { name: string }[] | null } | { procedures: { name: string } | { name: string }[] | null }[] | null;
      };
      const lastByClient = new Map<string, { date: string; proc: string | null }>();
      ((sessions ?? []) as unknown as SessRow[]).forEach((s) => {
        if (!s.client_id) return;
        const cur = lastByClient.get(s.client_id);
        if (!cur || s.done_at > cur.date) {
          const pkg = Array.isArray(s.packages) ? s.packages[0] : s.packages;
          const proc = pkg?.procedures;
          const procName = Array.isArray(proc) ? proc[0]?.name : proc?.name;
          lastByClient.set(s.client_id, { date: s.done_at, proc: procName ?? null });
        }
      });

      const base: InativoRow[] = ((clients ?? []) as { id: string; name: string; phone: string | null }[])
        .map((c) => {
          const l = lastByClient.get(c.id);
          return { ...c, last: l?.date ?? null, last_proc: l?.proc ?? null };
        });

      const between30and60 = base
        .filter((c) => c.last && c.last.slice(0, 10) < c30s && c.last.slice(0, 10) >= c60s)
        .sort((a, b) => (a.last ?? "").localeCompare(b.last ?? ""));
      const over60 = base
        .filter((c) => !c.last || c.last.slice(0, 10) < c60s)
        .sort((a, b) => (a.last ?? "").localeCompare(b.last ?? ""));

      setR30(between30and60);
      setR60(over60);
      setLoading(false);
    })();
  }, []);

  function whats(rows: InativoRow[], days: number) {
    const lines = [
      `🔔 Clientes sem visita há +${days} dias:`,
      ...rows.map((r) => `- ${r.name} | Último: ${r.last_proc ?? "—"} em ${r.last ? new Date(r.last).toLocaleDateString("pt-BR") : "nunca"} | ${r.phone ?? "sem telefone"}`),
    ];
    copyWhatsApp(lines.join("\n"));
  }

  const Section = ({ title, days, rows }: { title: string; days: number; rows: InativoRow[] }) => (
    <div className="space-y-2">
      <div className="bh-card p-4 flex items-end gap-3 flex-wrap">
        <div>
          <div className="font-display text-lg text-navy">{title}</div>
          <div className="text-xs text-text3 mt-0.5">{rows.length} cliente(s)</div>
        </div>
        <div className="flex-1" />
        <WhatsBtn onClick={() => whats(rows, days)} disabled={rows.length === 0} />
      </div>
      <div className="bh-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg2 text-text3">
            <tr>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">Último procedimento</th>
              <th className="text-left p-3">Última visita</th>
              <th className="text-left p-3">Telefone</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-6 text-center text-text3">Carregando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-success">Ninguém nessa faixa.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-text2">{r.last_proc ?? "—"}</td>
                <td className="p-3 text-text2">{r.last ? new Date(r.last).toLocaleDateString("pt-BR") : "nunca"}</td>
                <td className="p-3 text-text2">{r.phone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Section title="Sem visita há +30 dias" days={30} rows={r30} />
      <Section title="Sem visita há +60 dias" days={60} rows={r60} />
    </div>
  );
}

// ============= 3. PACOTES A VENCER =============
function PacotesReport() {
  const [threshold, setThreshold] = useState(2);
  const [rows, setRows] = useState<{ id: string; client_name: string; phone: string | null; remaining: number; procedure: string; last_session: string | null }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("packages")
        .select("id,client_id,sess_total,sess_done,procedures(name),clients(name,phone)")
        .eq("status", "active")
        .limit(500);
      if (error) toast.error(error.message);
      type Row = {
        id: string; client_id: string; sess_total: number; sess_done: number;
        procedures: { name: string } | { name: string }[] | null;
        clients: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null;
      };
      const rawRows = ((data ?? []) as unknown as Row[]);
      const filtered = rawRows
        .map((p) => {
          const proc = Array.isArray(p.procedures) ? p.procedures[0] : p.procedures;
          const cli = Array.isArray(p.clients) ? p.clients[0] : p.clients;
          return {
            id: p.id,
            client_id: p.client_id,
            client_name: cli?.name ?? "—",
            phone: cli?.phone ?? null,
            remaining: Number(p.sess_total ?? 0) - Number(p.sess_done ?? 0),
            procedure: proc?.name ?? "—",
          };
        })
        .filter((p) => p.remaining > 0 && p.remaining <= threshold);

      // Buscar última sessão done por pacote
      const ids = filtered.map((f) => f.id);
      const lastByPkg = new Map<string, string>();
      if (ids.length) {
        const { data: sess } = await supabase
          .from("sessions")
          .select("package_id,done_at")
          .in("package_id", ids)
          .eq("status", "done")
          .not("done_at", "is", null);
        ((sess ?? []) as { package_id: string; done_at: string }[]).forEach((s) => {
          const cur = lastByPkg.get(s.package_id);
          if (!cur || s.done_at > cur) lastByPkg.set(s.package_id, s.done_at);
        });
      }
      const out = filtered
        .map((f) => ({ ...f, last_session: lastByPkg.get(f.id) ?? null }))
        .sort((a, b) => a.remaining - b.remaining);
      setRows(out);
      setLoading(false);
    })();
  }, [threshold]);

  function whats() {
    const lines = [
      `📦 *Pacotes a vencer (≤${threshold} sessões)* — Beauty House\n`,
      ...rows.map((r) => `• ${r.client_name} — ${r.procedure} — restam ${r.remaining}${r.phone ? ` — ${r.phone}` : ""}`),
    ];
    copyWhatsApp(lines.join("\n"));
  }

  return (
    <>
      <ReportHeader title="Pacotes a vencer" count={rows.length}>
        <div>
          <label className="block text-xs text-text3 mb-1">Restando até</label>
          <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="bh-input">
            <option value={2}>2 sessões</option>
            <option value={3}>3 sessões</option>
            <option value={5}>5 sessões</option>
          </select>
        </div>
        <WhatsBtn onClick={whats} disabled={rows.length === 0} />
      </ReportHeader>
      <div className="bh-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg2 text-text3">
            <tr>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">Procedimento</th>
              <th className="text-right p-3">Sessões restantes</th>
              <th className="text-left p-3">Último atendimento</th>
              <th className="text-left p-3">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-center text-text3">Carregando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-text3">Nenhum pacote nessa faixa.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-medium">{r.client_name}</td>
                <td className="p-3">{r.procedure}</td>
                <td className="p-3 text-right font-semibold text-danger">{r.remaining}</td>
                <td className="p-3 text-text2">{r.last_session ? new Date(r.last_session).toLocaleDateString("pt-BR") : "—"}</td>
                <td className="p-3 text-text2">{r.phone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============= 4. ESTOQUE CRÍTICO =============
function EstoqueReport() {
  const [rows, setRows] = useState<{ id: string; name: string; category: string | null; qty_current: number; qty_min: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("products").select("id,name,category,qty_current,qty_min,active")
        .eq("active", true).order("name").limit(500);
      if (error) toast.error(error.message);
      const critical = ((data ?? []) as typeof rows).filter((r) => Number(r.qty_current) <= Number(r.qty_min));
      setRows(critical);
      setLoading(false);
    })();
  }, []);

  function whats() {
    const lines = [
      `⚠️ *Estoque crítico* — Beauty House\n`,
      ...rows.map((r) => `• ${r.name}${r.category ? ` (${r.category})` : ""} — atual: ${r.qty_current} / mín: ${r.qty_min}`),
    ];
    copyWhatsApp(lines.join("\n"));
  }
  function csv() {
    const data: (string | number)[][] = [["Produto", "Categoria", "Atual", "Mínimo", "Falta"]];
    rows.forEach((r) => data.push([r.name, r.category ?? "", r.qty_current, r.qty_min, Math.max(0, r.qty_min - r.qty_current)]));
    downloadCsv(`estoque_critico_${todayStr()}.csv`, data);
  }

  return (
    <>
      <ReportHeader title="Estoque crítico" count={rows.length}>
        <button onClick={csv} className="bh-btn" disabled={rows.length === 0}>
          <IconDownload size={16} /> CSV
        </button>
        <WhatsBtn onClick={whats} disabled={rows.length === 0} />
      </ReportHeader>
      <div className="bh-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg2 text-text3">
            <tr>
              <th className="text-left p-3">Produto</th>
              <th className="text-left p-3">Categoria</th>
              <th className="text-right p-3">Atual</th>
              <th className="text-right p-3">Mínimo</th>
              <th className="text-right p-3">Falta</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-center text-text3">Carregando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-success">Todos os produtos acima do mínimo.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-text3">{r.category ?? "—"}</td>
                <td className="p-3 text-right text-danger font-semibold">{r.qty_current}</td>
                <td className="p-3 text-right">{r.qty_min}</td>
                <td className="p-3 text-right">{Math.max(0, Number(r.qty_min) - Number(r.qty_current))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ============= 5. PRODUTIVIDADE =============
function ProdutividadeReport() {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayStr());
  const [rows, setRows] = useState<{ name: string; sessions: number; appointments: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const fromTs = `${from}T00:00:00`;
      const toTs = `${to}T23:59:59`;
      const [{ data: users }, { data: sessions }, { data: appts }] = await Promise.all([
        supabase.from("app_users").select("id,name,active").eq("active", true).limit(500),
        supabase.from("sessions").select("professional_id,done_at,status")
          .eq("status", "done").gte("done_at", fromTs).lte("done_at", toTs).limit(500),
        supabase.from("appointments").select("professional_id,datetime")
          .gte("datetime", fromTs).lte("datetime", toTs).limit(500),
      ]);
      const sessByProf = new Map<string, number>();
      (sessions ?? []).forEach((s: { professional_id: string | null }) => {
        if (s.professional_id) sessByProf.set(s.professional_id, (sessByProf.get(s.professional_id) ?? 0) + 1);
      });
      const apptByProf = new Map<string, number>();
      (appts ?? []).forEach((a: { professional_id: string | null }) => {
        if (a.professional_id) apptByProf.set(a.professional_id, (apptByProf.get(a.professional_id) ?? 0) + 1);
      });
      const out = ((users ?? []) as { id: string; name: string }[])
        .map((u) => ({ name: u.name, sessions: sessByProf.get(u.id) ?? 0, appointments: apptByProf.get(u.id) ?? 0 }))
        .sort((a, b) => b.sessions - a.sessions);
      setRows(out);
      setLoading(false);
    })();
  }, [from, to]);

  const totalSess = rows.reduce((s, r) => s + r.sessions, 0);
  const max = Math.max(1, ...rows.map((r) => r.sessions));

  function whats() {
    const lines = [
      `📊 *Produtividade ${new Date(from).toLocaleDateString("pt-BR")} → ${new Date(to).toLocaleDateString("pt-BR")}* — Beauty House\n`,
      ...rows.map((r) => `• ${r.name}: ${r.sessions} sessões · ${r.appointments} agendamentos`),
      `\nTotal: ${totalSess} sessões`,
    ];
    copyWhatsApp(lines.join("\n"));
  }

  return (
    <>
      <ReportHeader title="Produtividade por profissional" count={rows.length}>
        <div>
          <label className="block text-xs text-text3 mb-1">De</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bh-input" />
        </div>
        <div>
          <label className="block text-xs text-text3 mb-1">Até</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bh-input" />
        </div>
        <WhatsBtn onClick={whats} disabled={rows.length === 0} />
      </ReportHeader>
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
                    <span className="text-navy font-semibold">{r.sessions}</span> sessões · {r.appointments} agendamentos
                  </span>
                </div>
                <div className="h-2 bg-bg2 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-gold" style={{ width: `${(r.sessions / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ============= 6. TOP CLIENTES =============
function TopClientesReport() {
  const [limit, setLimit] = useState(10);
  const [rows, setRows] = useState<{ id: string; name: string; phone: string | null; sessions: number; spent: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: sessions }, { data: income }] = await Promise.all([
        supabase.from("sessions").select("client_id").eq("status", "done").limit(500),
        supabase.from("income").select("client_id,amount").limit(500),
      ]);
      const sessByClient = new Map<string, number>();
      (sessions ?? []).forEach((s: { client_id: string | null }) => {
        if (s.client_id) sessByClient.set(s.client_id, (sessByClient.get(s.client_id) ?? 0) + 1);
      });
      const spentByClient = new Map<string, number>();
      (income ?? []).forEach((i: { client_id: string | null; amount: number }) => {
        if (i.client_id) spentByClient.set(i.client_id, (spentByClient.get(i.client_id) ?? 0) + Number(i.amount ?? 0));
      });
      const ids = Array.from(new Set([...sessByClient.keys(), ...spentByClient.keys()]));
      if (ids.length === 0) { setRows([]); setLoading(false); return; }
      const { data: cli } = await supabase.from("clients").select("id,name,phone").in("id", ids);
      const byId = new Map(((cli ?? []) as { id: string; name: string; phone: string | null }[]).map((c) => [c.id, c]));
      const out = ids
        .map((id) => ({
          id,
          name: byId.get(id)?.name ?? "—",
          phone: byId.get(id)?.phone ?? null,
          sessions: sessByClient.get(id) ?? 0,
          spent: spentByClient.get(id) ?? 0,
        }))
        .sort((a, b) => b.spent - a.spent)
        .slice(0, limit);
      setRows(out);
      setLoading(false);
    })();
  }, [limit]);

  const totalSpent = useMemo(() => rows.reduce((s, r) => s + r.spent, 0), [rows]);

  function whats() {
    const lines = [
      `👑 *Top ${rows.length} clientes* — Beauty House\n`,
      ...rows.map((r, i) => `${i + 1}. ${r.name} — ${r.sessions} sessões — ${fmtMoney(r.spent)}`),
    ];
    copyWhatsApp(lines.join("\n"));
  }

  return (
    <>
      <ReportHeader title="Top clientes (por gasto)" count={rows.length}>
        <div>
          <label className="block text-xs text-text3 mb-1">Limite</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="bh-input">
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={25}>Top 25</option>
            <option value={50}>Top 50</option>
          </select>
        </div>
        <div className="text-right">
          <div className="text-xs text-text3">Total no top</div>
          <div className="font-display text-xl text-navy">{fmtMoney(totalSpent)}</div>
        </div>
        <WhatsBtn onClick={whats} disabled={rows.length === 0} />
      </ReportHeader>
      <div className="bh-card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg2 text-text3">
            <tr>
              <th className="text-left p-3 w-10">#</th>
              <th className="text-left p-3">Cliente</th>
              <th className="text-left p-3">WhatsApp</th>
              <th className="text-right p-3">Sessões</th>
              <th className="text-right p-3">Total gasto</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-center text-text3">Carregando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-text3">Sem dados.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 text-text3">{i + 1}</td>
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-text2">{r.phone ?? "—"}</td>
                <td className="p-3 text-right">{r.sessions}</td>
                <td className="p-3 text-right font-semibold text-success">{fmtMoney(r.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
