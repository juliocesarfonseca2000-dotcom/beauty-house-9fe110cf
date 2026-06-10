import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { PontoTab } from "@/components/escala/PontoTab";

export const Route = createFileRoute("/_authenticated/escala")({
  component: EscalaPage,
});

type Pro = { id: string; name: string };
type Absence = {
  id: string;
  user_id: string;
  type: "vacation" | "absent" | "dayoff" | "leave";
  date_start: string;
  date_end: string;
  note: string | null;
};

const TYPE_COLOR: Record<Absence["type"], string> = {
  vacation: "bg-blue-500/70 text-white",
  absent: "bg-danger/80 text-white",
  dayoff: "bg-gold/80 text-white",
  leave: "bg-purple-600/80 text-white",
};
const TYPE_LABEL: Record<Absence["type"], string> = {
  vacation: "Férias", absent: "Falta", dayoff: "Folga", leave: "Licença",
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }

function EscalaPage() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<"calendario" | "ponto">("calendario");
  const canManage = me?.role === "admin" || me?.role === "receptionist";

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        <button type="button" onClick={() => setTab("calendario")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === "calendario" ? "border-gold text-navy" : "border-transparent text-text3 hover:text-navy"}`}>
          Calendário de escala
        </button>
        <button type="button" onClick={() => setTab("ponto")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === "ponto" ? "border-gold text-navy" : "border-transparent text-text3 hover:text-navy"}`}>
          Registro de ponto
        </button>
      </div>
      {/* Mantém ambas as abas montadas para evitar refetch e re-render ao alternar */}
      <div className={tab === "calendario" ? "" : "hidden"}>
        <CalendarTab canManage={canManage} />
      </div>
      <div className={tab === "ponto" ? "" : "hidden"}>
        <PontoTab />
      </div>
    </div>
  );
}

function CalendarTab({ canManage }: { canManage: boolean }) {
  const { user: me } = useAuth();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [pros, setPros] = useState<Pro[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<Absence["type"]>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Absence | null>(null);

  const toggleFilter = (t: Absence["type"]) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const filteredAbsences = useMemo(() => {
    if (activeFilters.size === 0) return absences;
    return absences.filter(a => activeFilters.has(a.type));
  }, [absences, activeFilters]);

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const dim = daysInMonth(y, m);
  const monthStart = useMemo(() => `${y}-${pad(m + 1)}-01`, [y, m]);
  const monthEnd = useMemo(() => `${y}-${pad(m + 1)}-${pad(dim)}`, [y, m, dim]);

  const load = async () => {
    setLoading(true);
    const proRes = me?.role === "professional"
      ? await supabase.from("app_users").select("id,name").eq("id", me.id)
      : await supabase.from("app_users").select("id,name").eq("active", true).order("name");
    const absRes = await supabase
      .from("staff_absences")
      .select("id,user_id,type,date_start,date_end,note")
      .lte("date_start", monthEnd)
      .gte("date_end", monthStart);
    if (proRes.error) toast.error(proRes.error.message);
    if (absRes.error) toast.error(absRes.error.message);
    setPros((proRes.data as Pro[]) ?? []);
    setAbsences((absRes.data as Absence[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [monthStart, monthEnd, me?.id, me?.role]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("escala-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_absences" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, monthEnd]);

  const days = Array.from({ length: dim }, (_, i) => i + 1);

  const cellFor = (userId: string, day: number): Absence | null => {
    const date = `${y}-${pad(m + 1)}-${pad(day)}`;
    return filteredAbsences.find((a) => a.user_id === userId && a.date_start <= date && a.date_end >= date) ?? null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCursor(new Date(y, m - 1, 1))} className="p-2 rounded-lg hover:bg-bg2 border border-border"><IconChevronLeft size={18} /></button>
          <div className="font-display text-xl text-navy capitalize min-w-[160px] text-center">
            {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </div>
          <button type="button" onClick={() => setCursor(new Date(y, m + 1, 1))} className="p-2 rounded-lg hover:bg-bg2 border border-border"><IconChevronRight size={18} /></button>
          <button type="button" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setCursor(d); }} className="ml-2 px-3 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-bg2">Hoje</button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs items-center">
          {(["vacation","absent","dayoff","leave"] as const).map((t) => (
            <button key={t} type="button" onClick={() => toggleFilter(t)}
              className={`px-2 py-1 rounded border transition-all ${
                activeFilters.has(t)
                  ? `${TYPE_COLOR[t]} border-transparent ring-2 ring-offset-1 ring-navy/30`
                  : "bg-bg2 text-text2 border-border hover:border-navy/30"
              }`}>
              {TYPE_LABEL[t]}
              {activeFilters.has(t) && <span className="ml-1 opacity-70">✓</span>}
            </button>
          ))}
          {activeFilters.size > 0 && (
            <button type="button" onClick={() => setActiveFilters(new Set())} className="px-2 py-1 rounded border border-border text-text3 hover:bg-bg2 text-xs">
              Limpar filtros ✕
            </button>
          )}
          {canManage && (
            <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }}
              className="px-3 py-2 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 text-sm flex items-center gap-1">
              <IconPlus size={14} /> Adicionar ausência
            </button>
          )}
          {me?.role === "admin" && <Link to="/usuarios" className="px-3 py-1.5 rounded-md border border-border text-text2 hover:bg-bg2">Usuários →</Link>}
        </div>
      </div>

      <div className="bh-card overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-text3 text-sm">Carregando…</div>
        ) : pros.length === 0 ? (
          <div className="p-6 text-center text-text3 text-sm">Nenhum profissional.</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="bg-bg2 text-text2 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-bg2 min-w-[160px]">Profissional</th>
                {days.map((d) => {
                  const dt = new Date(y, m, d);
                  const wd = dt.toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3);
                  const weekend = dt.getDay() === 0 || dt.getDay() === 6;
                  return (
                    <th key={d} className={`px-1 py-1 text-center font-semibold ${weekend ? "bg-bg2/60" : ""}`} style={{ minWidth: 32 }}>
                      <div className="text-[10px] text-text3 capitalize">{wd}</div>
                      <div>{d}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pros.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2 font-semibold text-navy sticky left-0 bg-card">{p.name}</td>
                  {days.map((d) => {
                    const a = cellFor(p.id, d);
                    const weekend = new Date(y, m, d).getDay() % 6 === 0;
                    return (
                      <td key={d} className={`p-0 text-center align-middle ${weekend && !a ? "bg-bg2/40" : ""}`} title={a ? TYPE_LABEL[a.type] : ""}>
                        {a ? (
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => { setEditing(a); setModalOpen(true); }}
                            className={`${TYPE_COLOR[a.type]} h-7 mx-px rounded text-[10px] flex items-center justify-center w-[calc(100%-2px)] ${canManage ? "hover:opacity-80 cursor-pointer" : ""}`}
                          >
                            {TYPE_LABEL[a.type][0]}
                          </button>
                        ) : <div className="h-7" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && <AbsenceModal initial={editing} pros={pros} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); load(); }} />}
    </div>
  );
}

function AbsenceModal({ initial, pros, onClose, onSaved }: { initial: Absence | null; pros: Pro[]; onClose: () => void; onSaved: () => void }) {
  const { user: me } = useAuth();
  const [userId, setUserId] = useState(initial?.user_id ?? pros[0]?.id ?? "");
  const [type, setType] = useState<Absence["type"]>(initial?.type ?? "dayoff");
  const [dateStart, setDateStart] = useState(initial?.date_start ?? "");
  const [dateEnd, setDateEnd] = useState(initial?.date_end ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);

  const today = new Date();
  const [monthCursor, setMonthCursor] = useState(() => {
    if (initial?.date_start) {
      const d = new Date(initial.date_start + "T00:00:00");
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDays, setSelectedDays] = useState<Set<string>>(() => {
    if (initial && initial.type === "dayoff") return new Set([initial.date_start]);
    return new Set();
  });

  const isDayoffMulti = type === "dayoff" && !initial;

  const monthDays = useMemo(() => {
    const y = monthCursor.getFullYear();
    const m = monthCursor.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startOffset = first.getDay();
    const days: Array<{ iso: string; day: number } | null> = [];
    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ iso, day: d });
    }
    return days;
  }, [monthCursor]);

  const toggleDay = (iso: string) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso); else next.add(iso);
      return next;
    });
  };

  const save = async () => {
    if (!userId) return toast.error("Selecione um funcionário");

    if (isDayoffMulti) {
      if (selectedDays.size === 0) return toast.error("Selecione ao menos um dia de folga");
      setBusy(true);
      const rows = Array.from(selectedDays).map(d => ({
        user_id: userId, type: "dayoff" as const, date_start: d, date_end: d, note: note || null, created_by: me?.id ?? null,
      }));
      const { error } = await supabase.from("staff_absences").insert(rows);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success(`${rows.length} folga(s) adicionada(s)!`);
      onSaved();
      return;
    }

    if (!dateStart || !dateEnd) return toast.error("Informe as datas");
    if (dateEnd < dateStart) return toast.error("Data final inválida");
    setBusy(true);
    if (initial) {
      const { error } = await supabase.from("staff_absences").update({
        user_id: userId, type, date_start: dateStart, date_end: dateEnd, note: note || null,
      }).eq("id", initial.id);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Atualizado!");
    } else {
      const { error } = await supabase.from("staff_absences").insert({
        user_id: userId, type, date_start: dateStart, date_end: dateEnd, note: note || null, created_by: me?.id ?? null,
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Adicionado!");
    }
    onSaved();
  };

  const remove = async () => {
    if (!initial) return;
    if (!window.confirm("Excluir esta ausência?")) return;
    setBusy(true);
    const { error } = await supabase.from("staff_absences").delete().eq("id", initial.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    onSaved();
  };

  const inp = "w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-gold/40";
  const monthLabel = monthCursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const weekdayLabels = ["D", "S", "T", "Q", "Q", "S", "S"];

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">{initial ? "Editar ausência" : "Nova ausência"}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2">✕</button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase mb-1">Funcionário</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inp}>
              {pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase mb-1">Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value as Absence["type"])} className={inp}>
              <option value="dayoff">Folga</option>
              <option value="vacation">Férias</option>
              <option value="absent">Falta</option>
              <option value="leave">Licença</option>
            </select>
          </div>

          {isDayoffMulti ? (
            <div>
              <label className="block text-xs font-semibold text-text2 uppercase mb-2">Selecione as folgas do mês</label>
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} className="px-2 py-1 rounded-md border border-border hover:bg-bg2 text-sm">‹</button>
                <div className="font-semibold text-navy capitalize text-sm">{monthLabel}</div>
                <button type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} className="px-2 py-1 rounded-md border border-border hover:bg-bg2 text-sm">›</button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-text2 uppercase mb-1">
                {weekdayLabels.map((w, i) => <div key={i}>{w}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const sel = selectedDays.has(d.iso);
                  return (
                    <button
                      type="button"
                      key={d.iso}
                      onClick={() => toggleDay(d.iso)}
                      className={`aspect-square rounded-md text-sm font-medium transition ${sel ? "bg-navy text-white" : "bg-bg2 hover:bg-gold/20 text-navy"}`}
                    >
                      {d.day}
                    </button>
                  );
                })}
              </div>
              {selectedDays.size > 0 && (
                <div className="mt-2 text-xs text-text2">{selectedDays.size} dia(s) selecionado(s)</div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-text2 uppercase mb-1">De</label>
                <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text2 uppercase mb-1">Até</label>
                <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className={inp} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text2 uppercase mb-1">Observação</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inp} placeholder="Opcional" />
          </div>
        </div>
        <div className="flex justify-between gap-2 px-6 py-4 border-t">
          {initial ? (
            <button type="button" onClick={remove} disabled={busy} className="px-3 py-2 rounded-lg border border-danger text-danger text-sm font-semibold hover:bg-danger/10 flex items-center gap-1">
              <IconTrash size={14} /> Excluir
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button type="button" onClick={save} disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
              {busy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
