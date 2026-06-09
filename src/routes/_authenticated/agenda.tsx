import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconPlus, IconX, IconSearch, IconCalendarEvent, IconTrash } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { withTimeout } from "@/lib/with-timeout";

export const Route = createFileRoute("/_authenticated/agenda")({
  component: AgendaPage,
});

type Professional = { id: string; name: string };
type Procedure = { id: string; name: string; duration_min: number | null };
type PurchasedProcedure = Procedure & { available: number };
type Client = { id: string; name: string; record_num: number };
type Appt = {
  id: string;
  client_id: string;
  procedure_id: string | null;
  professional_id: string;
  datetime: string;
  duration_min: number | null;
  status: string;
  notes: string | null;
  clients: { name: string } | null;
  procedures: { name: string } | null;
};
type Absence = { user_id: string; type: "vacation"|"absent"|"dayoff"|"leave"; date_start: string; date_end: string; };

const ABS_LABEL: Record<Absence["type"], string> = { vacation: "Férias", absent: "Falta", dayoff: "Folga", leave: "Licença" };


const START_HOUR = 7;
const END_HOUR = 21;
const SLOT_MIN = 30;
const SLOT_PX = 32; // height per 30min slot
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MIN;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gold/15 text-navy border-l-gold",
  confirmed: "bg-blue-500/15 text-navy border-l-blue-500",
  done: "bg-success/15 text-success border-l-success",
  cancelled: "bg-danger/10 text-danger border-l-danger line-through",
};

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function AgendaPage() {
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [pros, setPros] = useState<Professional[]>([]);
  const [proFilter, setProFilter] = useState<string>("all");
  const [appts, setAppts] = useState<Appt[]>([]);
  const [creating, setCreating] = useState<{ proId?: string; hour: number; min: number } | null>(null);
  const [viewing, setViewing] = useState<Appt | null>(null);
  const [loading, setLoading] = useState(true);
  const [absences, setAbsences] = useState<Absence[]>([]);

  const dayStart = useMemo(() => { const d = new Date(date); d.setHours(0,0,0,0); return d; }, [date]);
  const dayEnd = useMemo(() => addDays(dayStart, 1), [dayStart]);
  const dayYmd = useMemo(() => fmtDate(dayStart), [dayStart]);


  const load = async () => {
    setLoading(true);
    const [{ data: pdata }, { data: adata }] = await Promise.all([
      supabase.from("app_users").select("id,name").eq("active", true)
        .eq("role", "professional").order("name"),
      supabase.from("appointments")
        .select("id,client_id,procedure_id,professional_id,datetime,duration_min,status,notes,clients(name),procedures(name)")
        .gte("datetime", dayStart.toISOString())
        .lt("datetime", dayEnd.toISOString())
        .order("datetime"),
    ]);
    setPros((pdata as Professional[]) ?? []);
    setAppts((adata as unknown as Appt[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      supabase.from("app_users").select("id,name").eq("active", true).eq("role", "professional").order("name"),
      supabase.from("appointments")
        .select("id,client_id,procedure_id,professional_id,datetime,duration_min,status,notes,clients(name),procedures(name)")
        .gte("datetime", dayStart.toISOString())
        .lt("datetime", dayEnd.toISOString())
        .order("datetime"),
    ]).then(([pdata, adata]) => {
      if (!active) return;
      setPros((pdata.data as Professional[]) ?? []);
      setAppts((adata.data as unknown as Appt[]) ?? []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [dayStart.getTime(), dayEnd]);

  const visiblePros = proFilter === "all" ? pros : pros.filter((p) => p.id === proFilter);

  const apptsByPro = useMemo(() => {
    const map: Record<string, Appt[]> = {};
    for (const p of visiblePros) map[p.id] = [];
    for (const a of appts) {
      if (!map[a.professional_id]) continue;
      map[a.professional_id].push(a);
    }
    return map;
  }, [appts, visiblePros]);

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
    const totalMin = START_HOUR * 60 + i * SLOT_MIN;
    return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(addDays(date, -1))} className="p-2 rounded-lg hover:bg-bg2 border border-border">
            <IconChevronLeft size={18} />
          </button>
          <button onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setDate(d); }} className="px-3 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-bg2">
            Hoje
          </button>
          <button onClick={() => setDate(addDays(date, 1))} className="p-2 rounded-lg hover:bg-bg2 border border-border">
            <IconChevronRight size={18} />
          </button>
          <input
            type="date"
            value={fmtDate(date)}
            onChange={(e) => { const [y,m,d] = e.target.value.split("-").map(Number); setDate(new Date(y, m-1, d)); }}
            className="ml-2 px-2 py-1.5 rounded-lg border border-border text-sm"
          />
          <div className="hidden sm:block font-display text-lg text-navy ml-2 capitalize">
            {date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select value={proFilter} onChange={(e) => setProFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-border text-sm">
            <option value="all">Todos profissionais</option>
            {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={() => setCreating({ hour: 9, min: 0 })}
            className="px-4 py-2 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center gap-2"
          >
            <IconPlus size={18} /> Agendar
          </button>
        </div>
      </div>

      <div className="bh-card overflow-x-auto">
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : visiblePros.length === 0 ? (
          <div className="p-8 text-center text-text3">Nenhum profissional ativo.</div>
        ) : (
          <div className="min-w-[640px]">
            {/* Header */}
            <div className="grid sticky top-0 bg-card z-10 border-b" style={{ gridTemplateColumns: `64px repeat(${visiblePros.length}, minmax(140px, 1fr))` }}>
              <div className="px-2 py-3 bg-bg2 border-r" />
              {visiblePros.map((p) => (
                <div key={p.id} className="px-3 py-3 text-center border-r last:border-r-0 bg-bg2">
                  <div className="font-display text-navy truncate">{p.name}</div>
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid relative" style={{ gridTemplateColumns: `64px repeat(${visiblePros.length}, minmax(140px, 1fr))` }}>
              {/* Hours column */}
              <div className="border-r bg-bg2/50">
                {slots.map((s, i) => (
                  <div key={i} className="text-[10px] text-text3 font-mono px-2 text-right" style={{ height: SLOT_PX }}>
                    {s.m === 0 ? `${String(s.h).padStart(2,"0")}:00` : ""}
                  </div>
                ))}
              </div>

              {/* Pro columns */}
              {visiblePros.map((p) => (
                <div key={p.id} className="relative border-r last:border-r-0">
                  {/* Background slots */}
                  {slots.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCreating({ proId: p.id, hour: s.h, min: s.m })}
                      className={`block w-full hover:bg-gold/5 ${s.m === 0 ? "border-t" : "border-t border-dashed border-border/40"}`}
                      style={{ height: SLOT_PX }}
                    />
                  ))}

                  {/* Appointment blocks */}
                  {(apptsByPro[p.id] ?? []).map((a) => {
                    const dt = new Date(a.datetime);
                    const minFromStart = (dt.getHours() - START_HOUR) * 60 + dt.getMinutes();
                    if (minFromStart < 0 || minFromStart >= (END_HOUR - START_HOUR) * 60) return null;
                    const dur = a.duration_min ?? 60;
                    const top = (minFromStart / SLOT_MIN) * SLOT_PX;
                    const height = Math.max(SLOT_PX, (dur / SLOT_MIN) * SLOT_PX) - 2;
                    return (
                      <div
                        key={a.id}
                        onClick={() => setViewing(a)}
                        className={`absolute left-1 right-1 rounded p-1.5 text-xs border-l-2 cursor-pointer shadow-sm overflow-hidden ${STATUS_COLORS[a.status] ?? STATUS_COLORS.pending}`}
                        style={{ top, height }}
                      >
                        <div className="font-semibold truncate text-[11px]">
                          {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {a.clients?.name}
                        </div>
                        <div className="text-[10px] opacity-70 truncate">{a.procedures?.name ?? "—"}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {creating && (
        <ApptModal
          initialDate={date}
          initialHour={creating.hour}
          initialMin={creating.min}
          initialProId={creating.proId}
          pros={pros}
          onClose={() => setCreating(null)}
          onSaved={() => { setCreating(null); load(); }}
        />
      )}
      {viewing && (
        <ApptViewModal appt={viewing} onClose={() => setViewing(null)} onChanged={() => { setViewing(null); load(); }} />
      )}
    </div>
  );
}

function ApptModal({ initialDate, initialHour, initialMin, initialProId, pros, onClose, onSaved }: {
  initialDate: Date; initialHour: number; initialMin: number; initialProId?: string; pros: Professional[]; onClose: () => void; onSaved: () => void;
}) {
  const [client, setClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Client[]>([]);
  const [procs, setProcs] = useState<PurchasedProcedure[]>([]);
  const [procId, setProcId] = useState("");
  const [proId, setProId] = useState(initialProId ?? pros[0]?.id ?? "");
  const [date, setDate] = useState(fmtDate(initialDate));
  const [time, setTime] = useState(`${String(initialHour).padStart(2, "0")}:${String(initialMin).padStart(2, "0")}`);
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setProcId("");
    setProcs([]);
    if (!client) return () => { active = false; };
    withTimeout(
      supabase
        .from("packages")
        .select("id,sess_total,sess_done,procedure_id,procedures(id,name,duration_min)")
        .eq("client_id", client.id)
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      10000,
      "Carregamento dos procedimentos comprados",
    ).then(({ data, error }) => {
      if (!active) return;
      if (error) throw error;
      type PackageRow = { sess_total: number | null; sess_done: number | null; procedures: Procedure | Procedure[] | null };
      const grouped = new Map<string, PurchasedProcedure>();
      ((data as unknown as PackageRow[]) ?? []).forEach((pkg) => {
        const proc = Array.isArray(pkg.procedures) ? pkg.procedures[0] : pkg.procedures;
        if (!proc) return;
        const available = Math.max(0, Number(pkg.sess_total ?? 0) - Number(pkg.sess_done ?? 0));
        if (available <= 0) return;
        const current = grouped.get(proc.id);
        grouped.set(proc.id, { ...proc, available: (current?.available ?? 0) + available });
      });
      setProcs(Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch((error) => {
      if (!active) return;
      toast.error(error instanceof Error ? error.message : "Erro ao carregar procedimentos comprados");
    });
    return () => { active = false; };
  }, [client]);

  useEffect(() => {
    if (search.length < 2 || client) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("clients")
        .select("id,name,record_num").ilike("name", `%${search}%`).eq("active", true).limit(6);
      setResults((data as Client[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, client]);

  useEffect(() => {
    const p = procs.find((x) => x.id === procId);
    if (p?.duration_min) setDuration(String(p.duration_min));
  }, [procId, procs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return toast.error("Selecione uma cliente");
    if (!proId) return toast.error("Selecione um profissional");
    if (!procId) return toast.error("Selecione um procedimento comprado por esta cliente.");
    setBusy(true);
    try {
      const dt = new Date(`${date}T${time}:00`);
      const dur = Number(duration) || 60;
      const end = new Date(dt.getTime() + dur * 60_000);
      const dayStart = new Date(dt); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

      const { data: existing, error: conflictErr } = await withTimeout(
        supabase.from("appointments")
          .select("id,datetime,duration_min,status,clients(name)")
          .eq("professional_id", proId)
          .neq("status", "cancelled")
          .gte("datetime", dayStart.toISOString())
          .lt("datetime", dayEnd.toISOString()),
        12000,
        "Verificação de conflito",
      );
      if (conflictErr) throw conflictErr;
      type ExistingAppt = { datetime: string; duration_min: number | null; clients: { name: string } | { name: string }[] | null };
      const conflict = ((existing as unknown as ExistingAppt[] | null) ?? []).find((a) => {
        const aStart = new Date(a.datetime);
        const aEnd = new Date(aStart.getTime() + (a.duration_min ?? 60) * 60_000);
        return aStart < end && aEnd > dt;
      });
      if (conflict) {
        const hhmm = new Date(conflict.datetime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const conflictClient = Array.isArray(conflict.clients) ? conflict.clients[0]?.name : conflict.clients?.name;
        toast.error(`Este profissional já tem atendimento às ${hhmm} com ${conflictClient ?? "cliente"} (${conflict.duration_min ?? 60} min). Escolha outro horário ou profissional.`);
        return;
      }

      const { error } = await withTimeout(supabase.from("appointments").insert({
        client_id: client.id,
        procedure_id: procId,
        professional_id: proId,
        datetime: dt.toISOString(),
        duration_min: dur,
        status: "pending",
        notes: notes || null,
      }), 12000, "Criação do agendamento");
      if (error) throw error;
      toast.success("Agendamento criado!");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao agendar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Novo agendamento</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Cliente*</label>
            {client ? (
              <div className="flex items-center justify-between bg-bg2 rounded-lg p-2.5">
                <div className="text-sm"><span className="font-semibold text-navy">{client.name}</span> <span className="text-text3">#{client.record_num}</span></div>
                <button type="button" onClick={() => setClient(null)} className="text-xs text-text2 hover:text-navy">Trocar</button>
              </div>
            ) : (
              <div className="relative">
                <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm" />
                {results.length > 0 && (
                  <div className="mt-1 bh-card max-h-48 overflow-y-auto absolute z-10 w-full bg-card">
                    {results.map((c) => (
                      <button key={c.id} type="button" onClick={() => { setClient(c); setSearch(""); }} className="w-full text-left px-3 py-2 hover:bg-bg2 text-sm">
                        <span className="font-semibold text-navy">{c.name}</span> <span className="text-text3 text-xs">#{c.record_num}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Procedimento">
              <select value={procId} onChange={(e) => setProcId(e.target.value)} className={inp} disabled={!client} required>
                <option value="">{client ? "Selecionar procedimento comprado..." : "Selecione a cliente primeiro"}</option>
                {procs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.available} sessão(ões)</option>)}
              </select>
              {client && procs.length === 0 && <div className="text-xs text-danger mt-1">Esta cliente não tem pacote ativo com sessões disponíveis.</div>}
            </Field>
            <Field label="Profissional*">
              <select value={proId} onChange={(e) => setProId(e.target.value)} className={inp} required>
                <option value="">Selecionar...</option>
                {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Data*"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} required /></Field>
            <Field label="Hora*"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inp} required /></Field>
            <Field label="Duração (min)"><input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className={inp} /></Field>
          </div>
          <Field label="Observações"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inp} /></Field>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
              {busy ? "Salvando..." : "Agendar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApptViewModal({ appt, onClose, onChanged }: { appt: Appt; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const dt = new Date(appt.datetime);

  const setStatus = async (status: string) => {
    setBusy(true);
    const { error } = await supabase.from("appointments").update({ status }).eq("id", appt.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    onChanged();
  };

  const remove = async () => {
    if (!window.confirm("Excluir agendamento?")) return;
    setBusy(true);
    const { error } = await supabase.from("appointments").delete().eq("id", appt.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy flex items-center gap-2"><IconCalendarEvent size={22} /> Agendamento</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-3 text-sm">
          <Row label="Cliente" value={appt.clients?.name ?? "—"} />
          <Row label="Procedimento" value={appt.procedures?.name ?? "—"} />
          <Row label="Quando" value={dt.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })} />
          <Row label="Duração" value={`${appt.duration_min ?? 60} min`} />
          <Row label="Status" value={<span className="bh-badge bg-navy/10 text-navy">{appt.status}</span>} />
          {appt.notes && <Row label="Observações" value={appt.notes} />}

          <div className="flex flex-wrap gap-2 pt-3 border-t">
            <button onClick={() => setStatus("confirmed")} disabled={busy} className="px-3 py-1.5 rounded-md bg-blue-500/10 text-blue-600 text-xs font-semibold hover:bg-blue-500/20">Confirmar</button>
            <button onClick={() => setStatus("done")} disabled={busy} className="px-3 py-1.5 rounded-md bg-success/10 text-success text-xs font-semibold hover:bg-success/20">Atendido</button>
            <button onClick={() => setStatus("cancelled")} disabled={busy} className="px-3 py-1.5 rounded-md bg-danger/10 text-danger text-xs font-semibold hover:bg-danger/20">Cancelar</button>
            <button onClick={remove} disabled={busy} className="ml-auto px-3 py-1.5 rounded-md text-text2 hover:text-danger text-xs font-semibold flex items-center gap-1">
              <IconTrash size={14} /> Excluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-gold/40 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>{children}</div>;
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-text2">{label}</span><span className="text-navy font-medium text-right">{value}</span></div>;
}
