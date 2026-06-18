import { useEffect, useMemo, useState } from "react";
import { IconPlayerPlay, IconCoffee, IconCoffeeOff, IconLogout, IconEdit, IconCheck } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  computeTotalMinutes,
  entryStatus,
  formatHM,
  formatHM_HHmm,
  todayISO,
  type TimeEntry,
} from "@/lib/timeUtils";

type Pro = { id: string; name: string; role: string };
type Absence = { user_id: string; type: string; date_start: string; date_end: string };

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  none:  { label: "Sem registro", cls: "bg-bg2 text-text3" },
  in:    { label: "Presente",     cls: "bg-green-500/15 text-green-700" },
  break: { label: "Em pausa",     cls: "bg-yellow-500/15 text-yellow-700" },
  out:   { label: "Saiu",         cls: "bg-blue-500/15 text-blue-700" },
  absent:{ label: "Falta",        cls: "bg-red-500/15 text-red-600" },
};

export function PontoTab() {
  const { user: me } = useAuth();
  const isAdminOrRecep = me?.role === "admin" || me?.role === "receptionist";
  const [date, setDate] = useState(todayISO());
  const [pros, setPros] = useState<Pro[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ userId: string; field: keyof TimeEntry } | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = async () => {
    setLoading(true);
    const proRes = isAdminOrRecep
      ? await supabase.from("app_users").select("id,name,role").eq("active", true).order("name")
      : await supabase.from("app_users").select("id,name,role").eq("id", me?.id ?? "");
    const entRes = await supabase.from("time_entries").select("*").eq("date", date);
    const absRes = await supabase
      .from("staff_absences")
      .select("user_id,type,date_start,date_end")
      .lte("date_start", date)
      .gte("date_end", date);
    setPros((proRes.data as Pro[]) ?? []);
    setEntries((entRes.data as TimeEntry[]) ?? []);
    setAbsences((absRes.data as Absence[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [date, me?.id]);

  // Realtime: re-fetch on changes
  useEffect(() => {
    const ch = supabase.channel(`ponto-${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const byUser = useMemo(() => {
    const m = new Map<string, TimeEntry>();
    for (const e of entries) m.set(e.user_id, e);
    return m;
  }, [entries]);

  const absByUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of absences) m.set(a.user_id, a.type);
    return m;
  }, [absences]);

  const upsert = async (userId: string, patch: Partial<TimeEntry>) => {
    if (!isAdminOrRecep && userId !== me?.id) {
      return toast.error("Sem permissão");
    }
    const cur = byUser.get(userId);
    const row = {
      user_id: userId,
      date,
      clock_in: cur?.clock_in ?? null,
      break_start: cur?.break_start ?? null,
      break_end: cur?.break_end ?? null,
      clock_out: cur?.clock_out ?? null,
      note: cur?.note ?? null,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("time_entries").upsert(row, { onConflict: "user_id,date" });
    if (error) toast.error(error.message);
    else load();
  };

  const nowIso = () => new Date().toISOString();

  const totalMinutes = (e: TimeEntry) => computeTotalMinutes(e);

  const teamTotal = useMemo(
    () => entries.reduce((s, e) => s + totalMinutes(e), 0),
    [entries],
  );

  const startEdit = (userId: string, field: keyof TimeEntry, current: string | null) => {
    setEditing({ userId, field });
    setEditValue(current ? formatHM_HHmm(current) : "");
  };

  const commitEdit = async () => {
    if (!editing) return;
    const { userId, field } = editing;
    let iso: string | null = null;
    if (editValue) {
      const [hh, mm] = editValue.split(":").map((s) => parseInt(s, 10));
      if (isNaN(hh) || isNaN(mm)) { toast.error("Formato HH:MM"); return; }
      const d = new Date(`${date}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00-03:00`);
      iso = d.toISOString();
    }
    await upsert(userId, { [field]: iso } as Partial<TimeEntry>);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="bh-card p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-text2 uppercase">Data:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm"
          />
          <button
            type="button"
            onClick={() => setDate(todayISO())}
            className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-bg2"
          >Hoje</button>
        </div>
        <div className="text-sm">
          <span className="text-text2">Total da equipe no dia:</span>{" "}
          <span className="font-display text-xl text-navy">{formatHM(teamTotal)}</span>
        </div>
      </div>

      <div className="bh-card overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-text3 text-sm">Carregando…</div>
        ) : pros.length === 0 ? (
          <div className="p-6 text-center text-text3 text-sm">Nenhum funcionário.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Funcionário</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-left px-3 py-2 font-semibold">Entrada</th>
                <th className="text-left px-3 py-2 font-semibold">Início pausa</th>
                <th className="text-left px-3 py-2 font-semibold">Fim pausa</th>
                <th className="text-left px-3 py-2 font-semibold">Saída</th>
                <th className="text-left px-3 py-2 font-semibold">Total</th>
                <th className="text-right px-3 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pros.map((p, i) => {
                const e = byUser.get(p.id);
                const absType = absByUser.get(p.id);
                const stRaw = absType === "absent" ? "absent" : entryStatus(e);
                const st = STATUS_LABEL[stRaw];
                const canAct = isAdminOrRecep || p.id === me?.id;
                const total = e ? totalMinutes(e) : 0;
                const isOver = total > 480;
                const isShort = total > 0 && total < 240 && e?.clock_out;
                const fields: Array<["clock_in"|"break_start"|"break_end"|"clock_out", string | null]> = [
                  ["clock_in", e?.clock_in ?? null],
                  ["break_start", e?.break_start ?? null],
                  ["break_end", e?.break_end ?? null],
                  ["clock_out", e?.clock_out ?? null],
                ];
                return (
                  <tr key={p.id} className={i % 2 ? "bg-bg2/40" : ""}>
                    <td className="px-3 py-2 font-semibold text-navy">{p.name}</td>
                    <td className="px-3 py-2"><span className={`bh-badge ${st.cls}`}>{st.label}</span></td>
                    {fields.map(([field, val]) => (
                      <td key={field} className="px-3 py-2 text-text2">
                        {editing?.userId === p.id && editing.field === field ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              value={editValue}
                              onChange={(ev) => setEditValue(ev.target.value)}
                              className="px-2 py-1 rounded border border-border text-xs w-24"
                              autoFocus
                            />
                            <button type="button" onClick={commitEdit} className="p-1 text-green-600 hover:bg-green-50 rounded">
                              <IconCheck size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!canAct}
                            onClick={() => startEdit(p.id, field, val)}
                            className="text-left hover:text-navy hover:underline disabled:no-underline"
                            title={canAct ? "Editar manualmente" : ""}
                          >
                            {formatHM_HHmm(val)}
                          </button>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <span className={`font-semibold ${isOver ? "text-orange-600" : isShort ? "text-yellow-600" : "text-navy"}`}>
                        {formatHM(total)}
                      </span>
                      {isOver && <span className="ml-1 text-[10px] bh-badge bg-orange-100 text-orange-700">Hora extra</span>}
                      {isShort && <span className="ml-1 text-[10px] bh-badge bg-yellow-100 text-yellow-700">Curto</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {absType === "absent" ? (
                        <span className="text-xs text-red-600">Falta cadastrada</span>
                      ) : !canAct ? (
                        <span className="text-xs text-text3">—</span>
                      ) : (
                        <div className="inline-flex gap-1">
                          {!e?.clock_in && (
                            <button type="button" onClick={() => upsert(p.id, { clock_in: nowIso() })}
                              className="px-2 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-700 flex items-center gap-1">
                              <IconPlayerPlay size={12} /> Entrada
                            </button>
                          )}
                          {e?.clock_in && !e.break_start && !e.clock_out && (
                            <button type="button" onClick={() => upsert(p.id, { break_start: nowIso() })}
                              className="px-2 py-1 rounded bg-yellow-500 text-white text-xs hover:bg-yellow-600 flex items-center gap-1">
                              <IconCoffee size={12} /> Pausa
                            </button>
                          )}
                          {e?.break_start && !e.break_end && (
                            <button type="button" onClick={() => upsert(p.id, { break_end: nowIso() })}
                              className="px-2 py-1 rounded bg-yellow-700 text-white text-xs hover:bg-yellow-800 flex items-center gap-1">
                              <IconCoffeeOff size={12} /> Fim pausa
                            </button>
                          )}
                          {e?.clock_in && !e.clock_out && (!e.break_start || e.break_end) && (
                            <button type="button" onClick={() => upsert(p.id, { clock_out: nowIso() })}
                              className="px-2 py-1 rounded bg-navy text-white text-xs hover:bg-navy2 flex items-center gap-1">
                              <IconLogout size={12} /> Saída
                            </button>
                          )}
                          {e?.clock_out && <IconEdit size={14} className="text-text3 mt-1" />}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <PontoHistory />
    </div>
  );
}

function PontoHistory() {
  const { user: me } = useAuth();
  const isAdminOrRecep = me?.role === "admin" || me?.role === "receptionist";
  const [userId, setUserId] = useState<string>(isAdminOrRecep ? "" : (me?.id ?? ""));
  const [pros, setPros] = useState<Pro[]>([]);
  const [start, setStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(todayISO());
  const [rows, setRows] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdminOrRecep) return;
    supabase.from("app_users").select("id,name,role").eq("active", true).order("name")
      .then((r) => setPros((r.data as Pro[]) ?? []));
  }, [isAdminOrRecep]);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("time_entries").select("*").gte("date", start).lte("date", end).order("date", { ascending: false });
    if (userId) q = q.eq("user_id", userId);
    else if (!isAdminOrRecep) q = q.eq("user_id", me?.id ?? "");
    const { data } = await q;
    setRows((data as TimeEntry[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId, start, end]);

  const exportPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTableMod = await import("jspdf-autotable");
    const doc = new jsPDF();
    const autoTable = (autoTableMod.default || autoTableMod) as unknown as (d: typeof doc, opts: Record<string, unknown>) => void;

    doc.setFontSize(16); doc.text("Espelho de Ponto — Beauty House", 14, 18);
    doc.setFontSize(10);
    doc.text(`Período: ${new Date(start+"T00:00").toLocaleDateString("pt-BR")} → ${new Date(end+"T00:00").toLocaleDateString("pt-BR")}`, 14, 26);
    const proName = pros.find(p => p.id === userId)?.name ?? (userId ? "" : "Todos");
    doc.text(`Funcionário: ${proName || (me?.name ?? "")}`, 14, 32);

    const proMap = new Map(pros.map(p => [p.id, p.name]));
    const body = rows.map((r) => {
      const total = computeTotalMinutes(r);
      return [
        new Date(r.date+"T00:00").toLocaleDateString("pt-BR"),
        proMap.get(r.user_id) ?? "",
        formatHM_HHmm(r.clock_in),
        formatHM_HHmm(r.break_start),
        formatHM_HHmm(r.break_end),
        formatHM_HHmm(r.clock_out),
        formatHM(total),
        r.note ?? "",
      ];
    });
    autoTable(doc, {
      startY: 38,
      head: [["Data","Funcionário","Entrada","Pausa ini","Pausa fim","Saída","Total","Obs"]],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [27, 41, 81] },
    });
    doc.save(`espelho-ponto-${start}-${end}.pdf`);
  };

  return (
    <div className="bh-card p-4 space-y-3">
      <div className="font-display text-lg text-navy">Histórico de ponto</div>
      <div className="flex flex-wrap gap-2 items-end">
        {isAdminOrRecep && (
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase mb-1">Funcionário</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="px-3 py-2 rounded-lg border border-border text-sm">
              <option value="">Todos</option>
              {pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-text2 uppercase mb-1">De</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="px-3 py-2 rounded-lg border border-border text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text2 uppercase mb-1">Até</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="px-3 py-2 rounded-lg border border-border text-sm" />
        </div>
        <button type="button" onClick={exportPdf} className="px-4 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 text-sm">
          Exportar PDF
        </button>
      </div>

      <div className="overflow-x-auto">
        {loading ? <div className="p-6 text-center text-text3 text-sm">Carregando…</div> :
         rows.length === 0 ? <div className="p-6 text-center text-text3 text-sm">Nenhum registro.</div> : (
          <table className="w-full text-xs">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-2 py-1.5">Data</th>
                {isAdminOrRecep && !userId && <th className="text-left px-2 py-1.5">Funcionário</th>}
                <th className="text-left px-2 py-1.5">Entrada</th>
                <th className="text-left px-2 py-1.5">Pausa</th>
                <th className="text-left px-2 py-1.5">Saída</th>
                <th className="text-left px-2 py-1.5">Total</th>
                <th className="text-left px-2 py-1.5">Status</th>
                <th className="text-left px-2 py-1.5">Obs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const total = computeTotalMinutes(r);
                const isOver = total > 480;
                return (
                  <tr key={r.id} className={i % 2 ? "bg-bg2/40" : ""}>
                    <td className="px-2 py-1.5">{new Date(r.date+"T00:00").toLocaleDateString("pt-BR")}</td>
                    {isAdminOrRecep && !userId && <td className="px-2 py-1.5">{pros.find(p => p.id === r.user_id)?.name ?? ""}</td>}
                    <td className="px-2 py-1.5">{formatHM_HHmm(r.clock_in)}</td>
                    <td className="px-2 py-1.5">{formatHM_HHmm(r.break_start)} → {formatHM_HHmm(r.break_end)}</td>
                    <td className="px-2 py-1.5">{formatHM_HHmm(r.clock_out)}</td>
                    <td className="px-2 py-1.5 font-semibold">{formatHM(total)}</td>
                    <td className="px-2 py-1.5">
                      {isOver
                        ? <span className="bh-badge bg-orange-100 text-orange-700">Hora extra</span>
                        : total > 0 ? <span className="bh-badge bg-green-100 text-green-700">Normal</span>
                        : <span className="bh-badge bg-bg2 text-text3">—</span>}
                    </td>
                    <td className="px-2 py-1.5">{r.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
