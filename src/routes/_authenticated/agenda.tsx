import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconPlus, IconX, IconSearch, IconCalendarEvent, IconTrash } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agenda")({
  component: AgendaPage,
});

type Professional = { id: string; name: string };
type Procedure = { id: string; name: string; duration_min: number | null };
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

const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 8h..20h
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gold/15 text-navy border-l-gold",
  confirmed: "bg-blue/15 text-navy border-l-blue",
  done: "bg-success/15 text-success border-l-success",
  cancelled: "bg-danger/10 text-danger border-l-danger line-through",
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDate(d: Date) { return d.toISOString().slice(0, 10); }

function AgendaPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [pros, setPros] = useState<Professional[]>([]);
  const [proFilter, setProFilter] = useState<string>("all");
  const [appts, setAppts] = useState<Appt[]>([]);
  const [creating, setCreating] = useState<{ date: Date; hour: number } | null>(null);
  const [viewing, setViewing] = useState<Appt | null>(null);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const load = async () => {
    setLoading(true);
    const [{ data: pdata }, { data: adata }] = await Promise.all([
      supabase.from("app_users").select("id,name").eq("active", true)
        .or("role.eq.professional,role.eq.admin").order("name"),
      supabase.from("appointments")
        .select("id,client_id,procedure_id,professional_id,datetime,duration_min,status,notes,clients(name),procedures(name)")
        .gte("datetime", weekStart.toISOString())
        .lt("datetime", addDays(weekStart, 7).toISOString())
        .order("datetime"),
    ]);
    setPros((pdata as Professional[]) ?? []);
    setAppts((adata as unknown as Appt[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [weekStart]);

  const filteredAppts = proFilter === "all" ? appts : appts.filter((a) => a.professional_id === proFilter);

  const apptsAt = (date: Date, hour: number) =>
    filteredAppts.filter((a) => {
      const d = new Date(a.datetime);
      return d.toDateString() === date.toDateString() && d.getHours() === hour;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-lg hover:bg-bg2 border border-border">
            <IconChevronLeft size={18} />
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="px-3 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-bg2">
            Hoje
          </button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-lg hover:bg-bg2 border border-border">
            <IconChevronRight size={18} />
          </button>
          <div className="font-display text-lg text-navy ml-2">
            {weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — {addDays(weekStart, 5).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select value={proFilter} onChange={(e) => setProFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-border text-sm">
            <option value="all">Todos profissionais</option>
            {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={() => setCreating({ date: new Date(), hour: 9 })}
            className="px-4 py-2 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center gap-2"
          >
            <IconPlus size={18} /> Agendar
          </button>
        </div>
      </div>

      <div className="bh-card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-text3">Carregando...</div>
        ) : (
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[60px_repeat(6,1fr)] border-b bg-bg2 text-text2 text-xs font-semibold uppercase tracking-wide">
              <div className="px-2 py-3"></div>
              {days.map((d) => {
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <div key={d.toISOString()} className={`px-2 py-3 text-center border-l ${isToday ? "text-gold" : ""}`}>
                    <div>{d.toLocaleDateString("pt-BR", { weekday: "short" })}</div>
                    <div className={`font-display text-lg ${isToday ? "text-gold" : "text-navy"}`}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
            {HOURS.map((h) => (
              <div key={h} className="grid grid-cols-[60px_repeat(6,1fr)] border-b min-h-[64px]">
                <div className="px-2 py-2 text-xs text-text3 font-mono border-r">{h}:00</div>
                {days.map((d) => {
                  const cellAppts = apptsAt(d, h);
                  return (
                    <button
                      key={d.toISOString() + h}
                      type="button"
                      onClick={() => cellAppts.length === 0 && setCreating({ date: d, hour: h })}
                      className="border-l p-1 text-left hover:bg-bg2/50 transition relative"
                    >
                      {cellAppts.map((a) => {
                        const prof = pros.find((p) => p.id === a.professional_id);
                        return (
                          <div
                            key={a.id}
                            onClick={(e) => { e.stopPropagation(); setViewing(a); }}
                            className={`mb-1 p-1.5 rounded text-xs border-l-2 cursor-pointer ${STATUS_COLORS[a.status] ?? STATUS_COLORS.pending}`}
                          >
                            <div className="font-semibold truncate">{a.clients?.name}</div>
                            <div className="text-[10px] opacity-70 truncate">{a.procedures?.name ?? "—"}</div>
                            <div className="text-[10px] opacity-70 truncate">{prof?.name ?? ""}</div>
                          </div>
                        );
                      })}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <ApptModal
          initialDate={creating.date}
          initialHour={creating.hour}
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

function ApptModal({ initialDate, initialHour, pros, onClose, onSaved }: {
  initialDate: Date; initialHour: number; pros: Professional[]; onClose: () => void; onSaved: () => void;
}) {
  const [client, setClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Client[]>([]);
  const [procs, setProcs] = useState<Procedure[]>([]);
  const [procId, setProcId] = useState("");
  const [proId, setProId] = useState(pros[0]?.id ?? "");
  const [date, setDate] = useState(fmtDate(initialDate));
  const [time, setTime] = useState(`${String(initialHour).padStart(2, "0")}:00`);
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("procedures").select("id,name,duration_min").eq("active", true).order("name");
      setProcs((data as Procedure[]) ?? []);
    })();
  }, []);

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
    setBusy(true);
    const dt = new Date(`${date}T${time}:00`);
    const { error } = await supabase.from("appointments").insert({
      client_id: client.id,
      procedure_id: procId || null,
      professional_id: proId,
      datetime: dt.toISOString(),
      duration_min: Number(duration) || 60,
      status: "pending",
      notes: notes || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Agendamento criado!");
    onSaved();
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
              <select value={procId} onChange={(e) => setProcId(e.target.value)} className={inp}>
                <option value="">Sem procedimento específico</option>
                {procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
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
            <button onClick={() => setStatus("confirmed")} disabled={busy} className="px-3 py-1.5 rounded-md bg-blue/10 text-blue text-xs font-semibold hover:bg-blue/20">Confirmar</button>
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
