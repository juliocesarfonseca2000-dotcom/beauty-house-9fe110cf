import { jsPDF } from "jspdf";
import { generateTermPdf } from "@/lib/term-pdf";
import { getClinicInfo } from "@/lib/contract-pdf";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useEffect, useMemo, useState, useRef } from "react";
import { IconChevronLeft, IconChevronRight, IconPlus, IconX, IconSearch, IconCalendarEvent, IconTrash, IconLock, IconCalendarOff, IconAlertTriangle } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { withTimeout } from "@/lib/with-timeout";
import { SignSessionModal, type SignSessionPackage, type SignSessionData } from "@/components/clients/SignSessionModal";

export const Route = createFileRoute("/_authenticated/agenda")({
  component: AgendaPage,
});

type DaySchedule = { start: string; end: string; active: boolean };
type WorkSchedule = Record<string, DaySchedule>;
type Professional = { id: string; name: string; work_schedule?: WorkSchedule | null };
type Procedure = { id: string; name: string; duration_min: number | null; duration_min_2?: number | null; resource_id?: string | null; room_id?: string | null };
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
  attendance_status: string | null;
  attendance_confirmed_at: string | null;
  attendance_confirmed_by: string | null;
  is_preference: boolean | null;
  is_first_visit: boolean | null;
  client_arrived_at: string | null;
  client_arrived_notified: boolean | null;
  client_confirmed_at: string | null;
  client_confirmed_by: string | null;
  clients: { name: string; cpf: string | null; phone: string | null; record_num: number | null } | null;
  procedures: { name: string } | null;
};
type Absence = { id: string; user_id: string; type: "vacation"|"absent"|"dayoff"|"leave"; date_start: string; date_end: string; };

const ABS_LABEL: Record<Absence["type"], string> = { vacation: "Férias", absent: "Falta", dayoff: "Folga", leave: "Licença" };

const START_HOUR = 7;
const END_HOUR = 21;
const SLOT_MIN = 22;
const SLOT_PX = 28;
const TOTAL_SLOTS = Math.ceil(((END_HOUR - START_HOUR) * 60) / SLOT_MIN);
const PIXELS_PER_MIN = SLOT_PX / SLOT_MIN;

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-50 text-navy border-l-amber-400",
  confirmed: "bg-slate-50 text-navy border-l-slate-300",
  done:      "bg-emerald-50 text-emerald-800 border-l-emerald-400",
  cancelled: "bg-red-50 text-red-700 border-l-red-400 line-through",
  blocked:   "bg-gray-100 text-gray-500 border-l-gray-400",
};


const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"] as const;

function getProScheduleLabel(pro: Professional, date: Date): string {
  if (!pro.work_schedule) return "";
  const spDate = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const key = DAY_KEYS[spDate.getDay()];
  const day = pro.work_schedule[key];
  if (!day) return "";
  if (!day.active) return "Folga";
  if (!day.start || !day.end) return "Folga";
  const fmt = (t: string) => t.replace(/:00$/, "h").replace(/:(\d+)$/, "h$1");
  return `${fmt(day.start)}-${fmt(day.end)}`;
}

function isOutsideWorkHours(pro: Professional, date: Date, slotH: number, slotM: number): boolean {
  if (!pro.work_schedule) return false;
  const spDate = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const key = DAY_KEYS[spDate.getDay()];
  const day = pro.work_schedule[key];
  if (!day) return false;
  if (!day.active) return true;
  if (!day.start || !day.end) return false;
  const slotMin = slotH * 60 + slotM;
  const [sH, sM] = day.start.split(":").map(Number);
  const [eH, eM] = day.end.split(":").map(Number);
  return slotMin < sH * 60 + sM || slotMin >= eH * 60 + eM;
}

function toSPDate(dt: Date) {
  return new Date(dt.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function AgendaPage() {
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const canManage = me?.role === "admin" || me?.role === "receptionist";
  const isProfessional = me?.role === "professional";
  const isProWithoutAgenda = me?.role === "professional" && (me as { show_in_agenda?: boolean | null }).show_in_agenda !== true;

  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [pros, setPros] = useState<Professional[]>([]);
  const [proFilter, setProFilter] = useState<string>(isProfessional && me?.id ? me.id : "all");
  const [appts, setAppts] = useState<Appt[]>([]);
  const [slotChoice, setSlotChoice] = useState<{ proId: string; hour: number; min: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ appt: Appt; toProId: string; toProName: string; newDatetime: Date } | null>(null);
  const [creating, setCreating] = useState<{ proId?: string; hour: number; min: number } | null>(null);
  const [blocking, setBlocking] = useState<{ proId: string; hour: number; min: number } | null>(null);
  const [blockingDay, setBlockingDay] = useState<{ proId: string; proName: string } | null>(null);
  const [viewing, setViewing] = useState<Appt | null>(null);
  const [loading, setLoading] = useState(true);
  const [absences, setAbsences] = useState<Absence[]>([]);

  const [moveSaving, setMoveSaving] = useState(false);

  const confirmMove = async () => {
    if (!pendingMove) return;
    setMoveSaving(true);
    try {
      const { error } = await withTimeout(
        supabase.from("appointments").update({
          professional_id: pendingMove.toProId,
          datetime: pendingMove.newDatetime.toISOString(),
        }).eq("id", pendingMove.appt.id),
        10000,
        "Mover agendamento"
      );
      if (error) throw error;
      toast.success("Agendamento movido!");
      setPendingMove(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao mover agendamento");
    } finally {
      setMoveSaving(false);
    }
  };

  const dayStart = useMemo(() => { const d = new Date(date); d.setHours(0,0,0,0); return d; }, [date]);
  const dayEnd = useMemo(() => addDays(dayStart, 1), [dayStart]);
  const dayYmd = useMemo(() => fmtDate(dayStart), [dayStart]);

  const load = async () => {
    setLoading(true);
    const prosQuery = isProfessional && me?.id
      ? supabase.from("app_users").select("id,name,work_schedule").eq("active", true)
          .eq("role", "professional").eq("id", me.id).order("name")
      : supabase.from("app_users").select("id,name,work_schedule").eq("active", true)
          .eq("role", "professional").eq("show_in_agenda", true).order("agenda_order", { ascending: true }).order("name");
    const [{ data: pdata, error: pErr }, { data: adata, error: aErr }, { data: absData, error: absErr }] = await Promise.all([
      prosQuery,


      supabase.from("appointments")
        .select("id,client_id,procedure_id,professional_id,datetime,duration_min,status,notes,attendance_status,attendance_confirmed_at,attendance_confirmed_by,is_preference,is_first_visit,client_arrived_at,client_arrived_notified,client_confirmed_at,client_confirmed_by,clients(name,cpf,phone,record_num),procedures(name)")
        .gte("datetime", dayStart.toISOString())
        .lt("datetime", dayEnd.toISOString())
        .order("datetime"),
      supabase.from("staff_absences")
        .select("id,user_id,type,date_start,date_end")
        .lte("date_start", dayYmd).gte("date_end", dayYmd),

    ]);
    if (pErr) console.error("[agenda] pros query failed", pErr);
    if (aErr) console.error("[agenda] appointments query failed", aErr);
    if (absErr) console.error("[agenda] absences query failed", absErr);
    setPros((pdata as Professional[]) ?? []);
    setAppts((adata as unknown as Appt[]) ?? []);
    setAbsences((absData as Absence[]) ?? []);
    setLoading(false);

  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStart.getTime(), dayEnd.getTime(), dayYmd, isProfessional, me?.id]);

  useEffect(() => {
    const channel = supabase.channel("agenda-realtime");
    const ch = channel as unknown as { on: (...args: unknown[]) => unknown };
    ch.on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => load());
    ch.on("postgres_changes", { event: "*", schema: "public", table: "staff_absences" }, () => load());
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStart.getTime(), dayEnd.getTime(), dayYmd, isProfessional, me?.id]);

  useEffect(() => {
    if (isProWithoutAgenda) navigate({ to: "/meu-ponto", replace: true });
  }, [isProWithoutAgenda, navigate]);

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

  if (isProWithoutAgenda) return <div className="fixed inset-0 bg-bg z-50" />;

  return (
    <div className="space-y-4">
      {!canManage && (
        <div className="bh-card p-3 bg-gold/10 border border-gold/40 text-sm text-navy">
          Visualização somente leitura. Apenas administradores e a recepção podem alterar a agenda.
        </div>
      )}

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
            {date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isProfessional && (
            <select value={proFilter} onChange={(e) => setProFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-border text-sm">
              <option value="all">Todos profissionais</option>
              {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {canManage && (
            <button
              onClick={() => setCreating({ hour: 9, min: 0 })}
              className="px-4 py-2 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center gap-2"
            >
              <IconPlus size={18} /> Agendar
            </button>
          )}
        </div>
      </div>

      <div className="bh-card overflow-auto -mx-4 px-0 sm:mx-0 [scroll-behavior:smooth] max-h-[calc(100vh-180px)]">
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : visiblePros.length === 0 ? (
          <div className="p-8 text-center text-text3">Nenhum profissional ativo.</div>
        ) : (
          <div style={{ minWidth: `${64 + visiblePros.length * 100}px` }}>
            <div className="grid sticky top-0 bg-card z-20 border-b shadow-sm" style={{ gridTemplateColumns: `64px repeat(${visiblePros.length}, minmax(96px, 160px))` }}>
              <div className="px-2 py-3 bg-bg2 border-r sticky left-0 z-30" />
              {visiblePros.map((p) => {
                const proAbsence = absences.find((a) => a.user_id === p.id);
                return (
                <div key={p.id} className="py-1.5 px-2 flex flex-col items-center gap-0.5 border-r last:border-r-0 bg-bg2">
                  <div className="font-semibold text-navy text-xs truncate w-full text-center" title={p.name}>{p.name}</div>
                  {(() => { const lbl = getProScheduleLabel(p, date); return lbl ? <div className="text-[10px] text-text2 leading-none">{lbl}</div> : null; })()}
                  {canManage && !proAbsence && (
                    <button
                      type="button"
                      title="Bloquear dia"
                      onClick={() => setBlockingDay({ proId: p.id, proName: p.name })}
                      className="mt-0.5 inline-flex items-center justify-center p-1 rounded text-text3 hover:bg-danger/10 hover:text-danger transition"
                    >
                      <IconCalendarOff size={13} />
                    </button>
                  )}
                  {canManage && proAbsence && (
                    <button
                      type="button"
                      title="Desbloquear"
                      onClick={async () => {
                        if (!window.confirm(`Desbloquear o dia de ${p.name}?`)) return;
                        const { error } = await supabase.from("staff_absences").delete().eq("id", proAbsence.id);
                        if (error) { toast.error(error.message); return; }
                        setAbsences((prev) => prev.filter((a) => a.id !== proAbsence.id));
                        toast.success(`Dia de ${p.name} desbloqueado`);
                      }}
                      className="mt-0.5 inline-flex items-center justify-center p-1 rounded bg-danger/10 text-danger hover:bg-danger/20 transition"
                    >
                      <IconCalendarOff size={13} />
                    </button>
                  )}
                  {!canManage && proAbsence && (
                    <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-danger/10 text-danger">
                      Dia bloqueado
                    </div>
                  )}
                </div>
                );
              })}

            </div>

            <div className="sm:hidden text-center text-[10px] text-text3 py-0.5 border-b bg-bg2/50 select-none">← deslize →</div>

            <div className="grid relative" style={{ gridTemplateColumns: `64px repeat(${visiblePros.length}, minmax(96px, 160px))` }}>
              <div className="border-r bg-bg2/50 sticky left-0 z-10">
                {slots.map((s, i) => {
                  const label = `${String(s.h).padStart(2, "0")}:${String(s.m).padStart(2, "0")}`;
                  const isHour = s.m === 0;
                  return (
                    <div
                      key={i}
                      className={`text-[10px] font-mono px-2 text-right ${isHour ? "text-navy font-semibold" : "text-text3"}`}
                      style={{ height: SLOT_PX, lineHeight: `${SLOT_PX}px` }}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>

              {visiblePros.map((p) => {
                const absence = absences.find((a) => a.user_id === p.id);
                return (
                <div
                  key={p.id}
                  className={`relative border-r last:border-r-0 ${canManage ? "cursor-pointer" : "cursor-default"}`}
                  onDragOver={(e) => { if (canManage && draggingId) e.preventDefault(); }}
                  onDrop={(e) => {
                    if (!canManage || !draggingId) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const totalMinutes = Math.max(0, Math.floor(y / PIXELS_PER_MIN));
                    const slotMin = Math.floor((START_HOUR * 60 + totalMinutes) / SLOT_MIN) * SLOT_MIN;
                    const nh = Math.floor(slotMin / 60);
                    const nm = slotMin % 60;
                    const dragged = Object.values(apptsByPro).flat().find((x) => x.id === draggingId);
                    if (!dragged) { setDraggingId(null); return; }
                    const nd = new Date(dragged.datetime);
                    nd.setHours(nh, nm, 0, 0);
                    setPendingMove({ appt: dragged, toProId: p.id, toProName: p.name, newDatetime: nd });
                    setDraggingId(null);
                  }}
                  onClick={(e) => {
                    if (!canManage) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const totalMinutes = Math.floor(y / PIXELS_PER_MIN);
                    const h = Math.floor((START_HOUR * 60 + totalMinutes) / 60);
                    const m = Math.floor(((START_HOUR * 60 + totalMinutes) % 60) / SLOT_MIN) * SLOT_MIN;
                    if (isOutsideWorkHours(p, date, h, m)) { toast.error(`Fora do horário de trabalho de ${p.name}`); return; }
                    setSlotChoice({ proId: p.id, hour: h, min: m });
                  }}
                >
                  {absence && (
                    <div className="absolute inset-0 z-20 bg-danger/10 backdrop-blur-[1px] flex items-start justify-center pt-4 pointer-events-none">
                      <div className="px-2 py-1 rounded bg-danger text-white text-[11px] font-semibold shadow">
                        {ABS_LABEL[absence.type]}
                      </div>
                    </div>
                  )}

                  {slots.map((s, i) => {
                    const isHour = s.m === 0;
                    const outOfHours = isOutsideWorkHours(p, date, s.h, s.m);
                    return (
                      <div
                        key={i}
                        className={`pointer-events-none w-full ${outOfHours ? "bg-gray-300/70" : ""}`}
                        style={{
                          height: SLOT_PX,
                          borderTop: isHour ? "1.5px solid #94a3b8" : "1px solid #cbd5e1",
                          backgroundImage: outOfHours ? "repeating-linear-gradient(45deg, rgba(100,116,139,0.15) 0, rgba(100,116,139,0.15) 6px, transparent 6px, transparent 12px)" : undefined,
                        }}
                      />
                    );
                  })}

                  {(() => {
                    const dayAppts = apptsByPro[p.id] ?? [];
                    const layout = new Map<string, { col: number; cols: number }>();
                    const sorted = [...dayAppts].sort((x, y) => new Date(x.datetime).getTime() - new Date(y.datetime).getTime());
                    const getRange = (a: Appt) => {
                      const s = new Date(a.datetime).getTime();
                      const e = s + (a.duration_min ?? 60) * 60000;
                      return [s, e] as const;
                    };
                    const used = new Set<string>();
                    for (const a of sorted) {
                      if (used.has(a.id)) continue;
                      const [as_, ae] = getRange(a);
                      const group = sorted.filter((b) => {
                        const [bs, be] = getRange(b);
                        return bs < ae && be > as_;
                      });
                      const cols = group.length;
                      group.forEach((b, idx) => {
                        if (!layout.has(b.id)) layout.set(b.id, { col: idx, cols });
                        used.add(b.id);
                      });
                    }
                    return dayAppts.map((a) => {
                    const dt = new Date(a.datetime);
                    const spDt = toSPDate(dt);
                    const minFromStart = (spDt.getHours() - START_HOUR) * 60 + spDt.getMinutes();
                    if (minFromStart < 0 || minFromStart >= (END_HOUR - START_HOUR) * 60) return null;
                    const dur = a.duration_min ?? 60;
                    const top = (minFromStart / SLOT_MIN) * SLOT_PX;
                    const height = Math.max(SLOT_PX, (dur / SLOT_MIN) * SLOT_PX) - 2;
                    const isGuest = !a.client_id;
                    const guestName = isGuest && a.notes?.startsWith("AVULSO: ") ? a.notes.slice(8) : null;
                    const lay = layout.get(a.id) ?? { col: 0, cols: 1 };
                    const widthPct = 100 / lay.cols;
                    const leftPct = widthPct * lay.col;
                    // Cor de fundo por prioridade (primeiro que bater vence)
                    let fillClass = STATUS_COLORS[a.status] ?? STATUS_COLORS.pending;
                    if (a.status !== "cancelled" && a.status !== "blocked" && a.status !== "done") {
                      if (a.attendance_status === "no_show") {
                        fillClass = "bg-red-50 text-red-700 border-l-red-400";              // Falta = vermelho
                      } else if (a.attendance_status === "confirmed") {
                        fillClass = "bg-green-100 text-emerald-900 border-l-emerald-400";   // Presença confirmada = verde forte (vence o dourado)
                      } else if (a.client_confirmed_at) {
                        fillClass = "bg-gold/20 text-navy border-l-gold";                   // Confirmado com cliente = dourado
                      } else {
                        fillClass = "bg-pink-100 text-navy border-l-pink-400";              // Pendente/Normal = rosa forte
                      }
                    }

                    const extra: string[] = [];
                    if (a.is_preference) extra.push("ring-2 ring-gold ring-offset-1");
                    if (a.is_first_visit) extra.push("outline outline-2 outline-blue-400");
                    // Cliente chegou = anel AZUL por fora (não apaga o fundo)
                    if (a.client_arrived_at && a.status !== "done" && a.status !== "cancelled") {
                      extra.push("ring-2 ring-blue-400 ring-offset-1");
                    }
                    if (isGuest) extra.push("!bg-purple-50 !border-l-purple-400");
                    return (
                      <div
                        key={a.id}
                        draggable={canManage && a.status !== "cancelled"}
                        onDragStart={(e) => { setDraggingId(a.id); e.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={(e) => { e.stopPropagation(); setViewing(a); }}
                        className={`group absolute rounded p-1 text-xs border-l-2 min-h-[20px] cursor-pointer shadow-sm ${fillClass} ${extra.join(" ")} ${draggingId === a.id ? "opacity-40" : ""}`}
                        style={{ top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)` }}
                      >
                        {a.status !== "blocked" && (
                          <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-50 w-52 rounded-lg bg-navy text-white text-[11px] leading-snug p-2.5 shadow-xl">
                            <div className="font-semibold mb-1">
                              {a.clients?.record_num ? `#${a.clients.record_num} · ` : ""}{guestName ?? a.clients?.name ?? "Avulso"}
                            </div>
                            <div className="opacity-90">{a.procedures?.name ?? "—"}</div>
                            <div className="opacity-70 mt-1">
                              {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {a.duration_min ?? 60} min
                            </div>
                            {a.client_confirmed_at && <div className="text-gold mt-1">★ Confirmado com cliente</div>}
                            {a.attendance_status === "confirmed" && <div className="text-emerald-300 mt-1">✓ Presença confirmada</div>}
                            {a.client_arrived_at && <div className="text-blue-300 mt-1">🏠 Cliente chegou</div>}
                          </div>
                        )}
                        {a.status === "blocked" ? (
                          <div className="font-semibold truncate text-[11px] flex items-center gap-1">
                            <IconLock size={11} /> {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {a.notes?.trim() ? a.notes : "Bloqueado"}
                          </div>
                        ) : (
                          <>
                            <div className="font-semibold truncate text-[11px]">
                              {a.client_arrived_at && <span title="Cliente chegou">🏠 </span>}
                              {a.is_preference && <span title="Preferência da cliente">⭐ </span>}
                              {a.is_first_visit && <span title="Primeira vez">🆕 </span>}
                              {isGuest && <span title="Avulso sem cadastro">👤 </span>}
                              {a.clients?.record_num ? `#${a.clients.record_num} ` : ""}{guestName ?? a.clients?.name ?? dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </div>

                            <div className="text-[10px] opacity-70 truncate">{a.procedures?.name ?? "—"}</div>
                          </>
                        )}
                      </div>
                    );
                    });
                  })()}
                </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="bh-card p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text2">
        <span className="font-semibold text-navy uppercase tracking-wide text-[10px]">Legenda:</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-pink-100 border-l-2 border-pink-400" /> Normal</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-gold/30 ring-2 ring-gold" /> ⭐ Preferência da cliente</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-gold/30 outline outline-2 outline-blue-400" /> 🆕 Primeira vez</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-blue-200 ring-2 ring-blue-400" /> 🏠 Cliente chegou</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-success/30 border-l-2 border-success" /> Realizado</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-text2/30" /> Bloqueado</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-danger/30" /> Férias / Folga / Falta / Licença</span>
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
        <ApptViewModal appt={viewing} pros={pros} canManage={canManage} onClose={() => setViewing(null)} onChanged={() => { setViewing(null); load(); }} />
      )}
      {slotChoice && (
        <SlotChoiceModal
          onClose={() => setSlotChoice(null)}
          onAgendar={() => { setCreating({ proId: slotChoice.proId, hour: slotChoice.hour, min: slotChoice.min }); setSlotChoice(null); }}
          onFechar={() => { setBlocking({ proId: slotChoice.proId, hour: slotChoice.hour, min: slotChoice.min }); setSlotChoice(null); }}
        />
      )}
      {blocking && (
        <BlockSlotModal
          date={date}
          hour={blocking.hour}
          min={blocking.min}
          proId={blocking.proId}
          proName={pros.find((p) => p.id === blocking.proId)?.name ?? ""}
          onClose={() => setBlocking(null)}
          onSaved={() => { setBlocking(null); load(); }}
        />
      )}
      {blockingDay && (
        <BlockDayModal
          date={date}
          proId={blockingDay.proId}
          proName={blockingDay.proName}
          existingAppts={appts.filter((a) => a.professional_id === blockingDay.proId && a.status !== "blocked" && a.status !== "cancelled")}
          onClose={() => setBlockingDay(null)}
          onSaved={() => { setBlockingDay(null); load(); }}
        />
      )}
      {pendingMove && (
        <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4" onClick={() => setPendingMove(null)}>
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b">
              <div className="font-display text-xl text-navy">Mover agendamento</div>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <p className="text-text2">
                Mover <b className="text-navy">{pendingMove.appt.clients?.name ?? "agendamento"}</b> para:
              </p>
              <div className="bh-card p-3 bg-bg2/50 space-y-1">
                <div><span className="text-text3">Profissional:</span> <b className="text-navy">{pendingMove.toProName}</b></div>
                <div><span className="text-text3">Data:</span> <b className="text-navy">{pendingMove.newDatetime.toLocaleDateString("pt-BR")}</b></div>
                <div><span className="text-text3">Horário:</span> <b className="text-navy">{pendingMove.newDatetime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</b></div>
              </div>
              <p className="text-text3 text-xs">Confirma a mudança?</p>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-6">
              <button onClick={() => setPendingMove(null)} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
              <button
                onClick={async () => {
                  const mv = pendingMove;
                  setPendingMove(null);
                  const { error } = await supabase.from("appointments").update({
                    professional_id: mv.toProId,
                    datetime: mv.newDatetime.toISOString(),
                  }).eq("id", mv.appt.id);
                  if (error) { toast.error(error.message); return; }
                  toast.success("Agendamento movido!");
                  load();
                }}
                className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy/90"
              >
                Confirmar mudança
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApptModal({ initialDate, initialHour, initialMin, initialProId, pros, onClose, onSaved, editingApptId, editingClientId, editingProcId, editingNotes }: {
  initialDate: Date; initialHour: number; initialMin: number; initialProId?: string; pros: Professional[]; onClose: () => void; onSaved: () => void;
  editingApptId?: string; editingClientId?: string; editingProcId?: string; editingNotes?: string;
}) {
  const [client, setClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Client[]>([]);
  const [searched, setSearched] = useState(false);
  const [useGuestName, setUseGuestName] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [procs, setProcs] = useState<PurchasedProcedure[]>([]);
  const [allProcs, setAllProcs] = useState<Procedure[]>([]);
  const [procId, setProcId] = useState("");
  const [looseProcId, setLooseProcId] = useState("");
  const [proId, setProId] = useState(initialProId ?? pros[0]?.id ?? "");
  const [date, setDate] = useState(fmtDate(initialDate));
  const [time, setTime] = useState(`${String(initialHour).padStart(2, "0")}:${String(initialMin).padStart(2, "0")}`);
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recWeekday, setRecWeekday] = useState<number>(initialDate.getDay());
  const [recTime, setRecTime] = useState(`${String(initialHour).padStart(2, "0")}:${String(initialMin).padStart(2, "0")}`);
  const [busy, setBusy] = useState(false);
  const [isPreference, setIsPreference] = useState(false);
  const [forceOverlap, setForceOverlap] = useState(false);
  type ExtraProc = { procId: string; proId: string; duration: string; time: string; edited: boolean };
  const [extraProcs, setExtraProcs] = useState<ExtraProc[]>([]);
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  const [procPros, setProcPros] = useState<Record<string, string[]>>({});
  const [procRoomId, setProcRoomId] = useState<string | null>(null);
  const [procEquipIds, setProcEquipIds] = useState<string[]>([]);
  const isEditing = !!editingApptId;

  useEffect(() => {
    supabase.from("procedures").select("id,name,duration_min,duration_min_2,resource_id,room_id").eq("active", true).order("name")
      .then(({ data }) => setAllProcs((data as Procedure[]) ?? []));
    supabase.from("procedure_professionals").select("procedure_id,professional_id")
      .then(({ data }) => {
        const map: Record<string, string[]> = {};
        ((data as { procedure_id: string; professional_id: string }[]) ?? []).forEach((r) => {
          (map[r.procedure_id] ??= []).push(r.professional_id);
        });
        setProcPros(map);
      });
  }, []);

  useEffect(() => {
    let active = true;
    setProcId("");
    setProcs([]);
    if (!client) return () => { active = false; };
    withTimeout(
      supabase
        .from("packages")
        .select("id,sess_total,sess_done,procedure_id,procedures(id,name,duration_min,duration_min_2,resource_id,room_id)")
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
    if (search.length < 2 || client) { setResults([]); setSearched(false); return; }
    const t = setTimeout(async () => {
      const isNum = /^\d+$/.test(search.trim());
      let query = supabase
        .from("clients")
        .select("id,name,record_num,phone")
        .eq("active", true)
        .limit(8);
      if (isNum) {
        query = query.or(`record_num.eq.${parseInt(search)},phone.ilike.%${search}%`);
      } else {
        query = query.ilike("name", `%${search}%`);
      }
      const { data } = await query;
      setResults((data as Client[]) ?? []);
      setSearched(true);
    }, 250);
    return () => clearTimeout(t);
  }, [search, client]);


  useEffect(() => {
    const proc = procId
      ? procs.find((x) => x.id === procId)
      : allProcs.find((x) => x.id === looseProcId);
    if (proc?.duration_min) setDuration(String(proc.duration_min));
    setProcRoomId(proc?.room_id ?? null);
    const id = procId || looseProcId;
    if (!id) { setProcEquipIds([]); return; }
    supabase.from("procedure_equipment").select("equipment_id").eq("procedure_id", id)
      .then(({ data }) => setProcEquipIds((data as { equipment_id: string }[] | null)?.map((x) => x.equipment_id) ?? []));
  }, [procId, looseProcId, procs, allProcs]);


  useEffect(() => { setRecTime(time); }, [time]);

  useEffect(() => {
    if (!editingClientId) return;
    supabase
      .from("clients")
      .select("id,name,record_num")
      .eq("id", editingClientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setClient(data as Client);
      });
  }, [editingClientId]);

  useEffect(() => {
    if (editingProcId) setProcId(editingProcId);
  }, [editingProcId]);

  useEffect(() => {
    if (editingNotes) setNotes(editingNotes);
  }, [editingNotes]);

  useEffect(() => {
    if (!client) { setIsFirstVisit(false); return; }
    (async () => {
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .neq("status", "cancelled");
      setIsFirstVisit((count ?? 0) === 0);
    })();
  }, [client]);

  const effectiveProcIdForFilter = procId || looseProcId;
  const filteredPros = useMemo(() => {
    if (!effectiveProcIdForFilter) return pros;
    const allowed = procPros[effectiveProcIdForFilter];
    if (!allowed || allowed.length === 0) return pros;
    return pros.filter((p) => allowed.includes(p.id));
  }, [effectiveProcIdForFilter, procPros, pros]);

  useEffect(() => {
    if (proId && filteredPros.length > 0 && !filteredPros.find((p) => p.id === proId)) {
      setProId("");
    }
  }, [filteredPros, proId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (useGuestName) {
      if (!guestName.trim()) return toast.error("Informe o nome do cliente avulso");
    } else {
      if (!client) return toast.error("Selecione uma cliente");
    }
    if (!proId) return toast.error("Selecione um profissional");
    const isLoose = useGuestName ? true : !procId;
    const effectiveProcId = useGuestName ? (looseProcId || null) : (procId || looseProcId);
    if (!useGuestName && isLoose && !looseProcId) return toast.error("Escolha qual procedimento será realizado (avulso)");
    const guestNotes = useGuestName ? `AVULSO: ${guestName.trim()}${notes ? ` — ${notes}` : ""}` : (notes || null);
    setBusy(true);
    try {
      if (isEditing && editingApptId) {
        const dur = Number(duration) || 60;
        const first = new Date(`${date}T${time}:00`);
        const { error } = await supabase
          .from("appointments")
          .update({
            client_id: useGuestName ? null : client!.id,
            procedure_id: effectiveProcId || null,
            professional_id: proId,
            datetime: first.toISOString(),
            duration_min: dur,
            notes: guestNotes,
            is_preference: isPreference,
          })
          .eq("id", editingApptId);
        if (error) throw error;
        toast.success("Agendamento atualizado!");
        onSaved();
        return;
      }

      const dur = Number(duration) || 60;
      const selectedProc = procs.find((x) => x.id === procId);
      const available = selectedProc?.available ?? 1;
      const targets: Date[] = [];
      const first = new Date(`${date}T${time}:00`);
      targets.push(first);

      if (recurring && available > 1 && !isLoose) {
        const dayMs = 86400000;
        const [rh, rm] = recTime.split(":").map(Number);
        const spFirst = new Date(first.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        let diff = (recWeekday - spFirst.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        const cursor = new Date(first.getTime() + diff * dayMs);
        cursor.setHours(rh || 0, rm || 0, 0, 0);
        targets.push(new Date(cursor));
        for (let i = 1; targets.length < available; i++) {
          const next = new Date(cursor.getTime() + 7 * i * dayMs);
          next.setHours(rh || 0, rm || 0, 0, 0);
          targets.push(next);
        }
        const lastYmd = fmtDate(targets[targets.length - 1]);
        const firstYmd = fmtDate(targets[0]);
        const { data: absData } = await supabase.from("staff_absences")
          .select("date_start,date_end").eq("user_id", proId)
          .lte("date_start", lastYmd).gte("date_end", firstYmd);
        const skipped: string[] = [];
        const filtered = targets.filter((t, idx) => {
          if (idx === 0) return true;
          const y = fmtDate(t);
          const blocked = (absData ?? []).some((a) => a.date_start <= y && a.date_end >= y);
          if (blocked) skipped.push(t.toLocaleDateString("pt-BR"));
          return !blocked;
        });
        if (skipped.length) toast.message(`Pulando ${skipped.length} data(s) por ausência: ${skipped.join(", ")}`);
        targets.length = 0;
        targets.push(...filtered);
      }

      if (targets.length === 0) { toast.error("Nenhuma data disponível para agendar."); return; }

      const minD = new Date(Math.min(...targets.map((t) => t.getTime())));
      minD.setHours(0,0,0,0);
      const maxD = new Date(Math.max(...targets.map((t) => t.getTime())));
      maxD.setHours(0,0,0,0); maxD.setDate(maxD.getDate() + 1);

      const { data: existing, error: conflictErr } = await withTimeout(
        supabase.from("appointments")
          .select("id,datetime,duration_min,status,clients(name)")
          .eq("professional_id", proId)
          .neq("status", "cancelled")
          .gte("datetime", minD.toISOString())
          .lt("datetime", maxD.toISOString()),
        12000, "Verificação de conflito",
      );
      if (conflictErr) throw conflictErr;
      type ExistingAppt = { datetime: string; duration_min: number | null; clients: { name: string } | { name: string }[] | null };
      const existingList = (existing as unknown as ExistingAppt[] | null) ?? [];

      if (!forceOverlap) {
        for (const dt of targets) {
          const end = new Date(dt.getTime() + dur * 60_000);
          const conflict = existingList.find((a) => {
            const aStart = new Date(a.datetime);
            const aEnd = new Date(aStart.getTime() + (a.duration_min ?? 60) * 60_000);
            return aStart < end && aEnd > dt;
          });
          if (conflict) {
            const hhmm = new Date(conflict.datetime).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
            toast.error(`Conflito em ${hhmm}. Marque "Forçar encaixe" para agendar no mesmo horário, ou ajuste.`);
            return;
          }
        }
      }

      // Sala: 1 atendimento por vez por sala
      if (procRoomId) {
        const { data: roomMeta } = await supabase.from("rooms").select("name").eq("id", procRoomId).maybeSingle();
        const roomName = (roomMeta as { name?: string } | null)?.name ?? "Sala";
        const { data: roomProcData } = await supabase.from("procedures").select("id").eq("room_id", procRoomId);
        const roomProcIds = (roomProcData as { id: string }[] | null)?.map((x) => x.id) ?? [];
        if (roomProcIds.length > 0) {
          const { data: roomAppts } = await supabase
            .from("appointments")
            .select("datetime,duration_min")
            .in("procedure_id", roomProcIds)
            .neq("status", "cancelled")
            .gte("datetime", minD.toISOString())
            .lt("datetime", maxD.toISOString());
          type RoomAppt = { datetime: string; duration_min: number | null };
          for (const dt of targets) {
            const end = new Date(dt.getTime() + dur * 60_000);
            const conflict = ((roomAppts as unknown as RoomAppt[] | null) ?? []).find((a) => {
              const aStart = new Date(a.datetime);
              const aEnd = new Date(aStart.getTime() + (a.duration_min ?? 60) * 60_000);
              return aStart < end && aEnd > dt;
            });
            if (conflict) {
              toast.error(`Sala "${roomName}" ocupada nesse horário.`);
              return;
            }
          }
        }
      }

      // Aparelhos: 1 uso por aparelho por vez
      for (const eqId of procEquipIds) {
        const { data: eqMeta } = await supabase.from("equipment").select("name").eq("id", eqId).maybeSingle();
        const eqName = (eqMeta as { name?: string } | null)?.name ?? "Aparelho";
        const { data: eqProcData } = await supabase.from("procedure_equipment").select("procedure_id").eq("equipment_id", eqId);
        const eqProcIds = (eqProcData as { procedure_id: string }[] | null)?.map((x) => x.procedure_id) ?? [];
        if (eqProcIds.length > 0) {
          const { data: eqAppts } = await supabase
            .from("appointments")
            .select("datetime,duration_min")
            .in("procedure_id", eqProcIds)
            .neq("status", "cancelled")
            .gte("datetime", minD.toISOString())
            .lt("datetime", maxD.toISOString());
          type EqAppt = { datetime: string; duration_min: number | null };
          for (const dt of targets) {
            const end = new Date(dt.getTime() + dur * 60_000);
            const conflict = ((eqAppts as unknown as EqAppt[] | null) ?? []).find((a) => {
              const aStart = new Date(a.datetime);
              const aEnd = new Date(aStart.getTime() + (a.duration_min ?? 60) * 60_000);
              return aStart < end && aEnd > dt;
            });
            if (conflict) {
              toast.error(`Aparelho "${eqName}" em uso nesse horário.`);
              return;
            }
          }
        }
      }

      const recurrenceGroup = recurring && targets.length > 1 && !isLoose
        ? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
        : null;

      const rows = targets.map((dt, idx) => {
        const row: Record<string, unknown> = {
          client_id: useGuestName ? null : client!.id,
          procedure_id: effectiveProcId,
          professional_id: proId,
          datetime: dt.toISOString(),
          duration_min: dur,
          status: "pending",
          notes: guestNotes,
          is_loose: isLoose,
          is_preference: isPreference,
          is_first_visit: idx === 0 ? isFirstVisit : false,
        };

        if (recurrenceGroup) row.recurrence_group = recurrenceGroup;
        return row;
      });

      const { error } = await withTimeout(supabase.from("appointments").insert(rows), 12000, "Criação do agendamento");
      if (error) throw error;

      // Procedimentos extras em sequência (só no fluxo normal, não recorrente/avulso múltiplo)
      const validExtras = extraProcs.filter((ex) => ex.procId && ex.proId);
      let extrasCreated = 0;
      if (validExtras.length > 0 && !useGuestName && client) {
        // Cada extra usa o horário editado, se houver; senão segue em sequência a partir do fim do anterior
        let cursor = new Date(first.getTime() + dur * 60_000);
        const extraRows: Record<string, unknown>[] = [];
        for (const ex of validExtras) {
          const exDur = Number(ex.duration) || 60;
          let startAt = cursor;
          if (ex.edited && ex.time) {
            const [eh, em] = ex.time.split(":").map(Number);
            const d = new Date(first);
            d.setHours(eh || 0, em || 0, 0, 0);
            startAt = d;
          }
          extraRows.push({
            client_id: client.id,
            procedure_id: ex.procId,
            professional_id: ex.proId,
            datetime: startAt.toISOString(),
            duration_min: exDur,
            status: "pending",
            notes: null,
            is_loose: false,
            is_preference: false,
            is_first_visit: false,
          });
          cursor = new Date(startAt.getTime() + exDur * 60_000);
        }
        const { error: exErr } = await withTimeout(supabase.from("appointments").insert(extraRows), 12000, "Criação dos procedimentos em sequência");
        if (exErr) {
          toast.error("Agendamento principal criado, mas houve erro nos procedimentos em sequência: " + exErr.message);
        } else {
          extrasCreated = extraRows.length;
        }
      }

      const totalCreated = rows.length + extrasCreated;
      toast.success(totalCreated > 1 ? `${totalCreated} agendamentos criados!` : "Agendamento criado!");
      onSaved();
    } catch (err) {
      console.error("[agenda] erro ao agendar:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao agendar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">{isEditing ? "Editar agendamento" : "Novo agendamento"}</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Cliente*</label>
            {useGuestName ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="bh-badge bg-purple-100 text-purple-700">👤 Sem cadastro</span>
                  <button type="button" onClick={() => { setUseGuestName(false); setGuestName(""); }} className="text-xs text-text2 hover:text-navy ml-auto">Voltar à busca</button>
                </div>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Nome do cliente (sem ficha)"
                  className="w-full px-3 py-2 rounded-lg border border-purple-300 bg-purple-50 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>
            ) : client ? (
              <div className="flex items-center justify-between bg-bg2 rounded-lg p-2.5">
                <div className="text-sm"><span className="font-semibold text-navy">{client.name}</span> <span className="text-text3">#{client.record_num}</span></div>
                <button type="button" onClick={() => setClient(null)} className="text-xs text-text2 hover:text-navy">Trocar</button>
              </div>
            ) : (
              <div className="relative">
                <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, nº ficha ou telefone..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm" />
                {results.length > 0 && (
                  <div className="mt-1 bh-card max-h-48 overflow-y-auto absolute z-10 w-full bg-card">
                    {results.map((c) => (
                      <button key={c.id} type="button" onClick={() => { setClient(c); setSearch(""); setSearched(false); }} className="w-full text-left px-3 py-2 hover:bg-bg2 text-sm">
                        <span className="font-semibold text-navy">{c.name}</span> <span className="text-text3 text-xs">#{c.record_num}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searched && search.length >= 2 && results.length === 0 && (
                  <div className="mt-2 flex items-center justify-between gap-2 p-2 rounded-lg border border-dashed border-purple-300 bg-purple-50/50 text-xs">
                    <span className="text-text2">Nenhuma cliente encontrada.</span>
                    <button
                      type="button"
                      onClick={() => { setUseGuestName(true); setGuestName(search); setSearch(""); setResults([]); }}
                      className="px-2 py-1 rounded bg-purple-600 text-white font-semibold hover:bg-purple-700"
                    >
                      👤 Agendar sem cadastro
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Procedimento">
              <select value={procId} onChange={(e) => setProcId(e.target.value)} className={inp} disabled={!client && !useGuestName}>
                <option value="">{(client || useGuestName) ? "Avulso (definir no fechamento)" : "Selecione a cliente primeiro"}</option>
                {procs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.available} sessão(ões)</option>)}
              </select>
              {client && procs.length === 0 && <div className="text-xs text-danger mt-1">Esta cliente não tem pacote ativo com sessões disponíveis.</div>}
            </Field>
            <Field label="Profissional*">
              <select value={proId} onChange={(e) => setProId(e.target.value)} className={inp} required>
                <option value="">{effectiveProcIdForFilter ? "Sem preferência / Selecionar..." : "Selecionar..."}</option>
                {filteredPros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {effectiveProcIdForFilter && filteredPros.length < pros.length && (
                <div className="text-[11px] text-text3 mt-1">Mostrando apenas profissionais habilitadas para este procedimento.</div>
              )}
            </Field>
            {(!procId && (client || useGuestName)) && (
              <div className="md:col-span-2">
                <Field label="Qual procedimento será realizado? (avulso)*">
                  <select value={looseProcId} onChange={(e) => setLooseProcId(e.target.value)} className={inp} required>
                    <option value="">Selecionar procedimento...</option>
                    {allProcs.map((p) => <option key={p.id} value={p.id}>{p.name}{p.duration_min ? ` · ${p.duration_min} min` : ""}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <Field label="Data*"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} required /></Field>
            <Field label="Hora*"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inp} required /></Field>
            {(() => {
              const proc = procId ? procs.find((x) => x.id === procId) : allProcs.find((x) => x.id === looseProcId);
              if (proc?.duration_min_2 && proc.duration_min_2 !== proc.duration_min) {
                return (
                  <Field label="Duração">
                    <div className="flex gap-5 pt-1">
                      {([proc.duration_min, proc.duration_min_2] as number[]).map((d) => (
                        <label key={d} className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-navy">
                          <input type="radio" name="dur_choice" value={String(d)} checked={duration === String(d)} onChange={() => setDuration(String(d))} />
                          {d} min
                        </label>
                      ))}
                    </div>
                  </Field>
                );
              }
              return <Field label="Duração (min)"><input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className={inp} /></Field>;
            })()}
          </div>
          <Field label="Observações"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inp} /></Field>

          {!isEditing && (client || useGuestName) && (
            <div className="border-t pt-3 mt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text2 uppercase tracking-wide">Procedimentos em sequência</span>
                <button
                  type="button"
                  onClick={() => setExtraProcs((l) => [...l, { procId: "", proId: pros[0]?.id ?? "", duration: "60", time: "", edited: false }])}
                  className="text-xs font-semibold text-gold hover:text-gold/80 flex items-center gap-1"
                >
                  <IconPlus size={14} /> Adicionar procedimento
                </button>
              </div>
              {extraProcs.length === 0 && (
                <div className="text-[11px] text-text3">Agende vários procedimentos seguidos (ex: massagem + botox). O horário de cada um começa quando o anterior termina.</div>
              )}
              {extraProcs.map((ex, idx) => {
                // Horário sugerido: principal + soma das durações anteriores (só se o usuário não editou manualmente)
                const baseMin = (() => {
                  const [hh, mm] = time.split(":").map(Number);
                  return (hh || 0) * 60 + (mm || 0);
                })();
                const mainDur = Number(duration) || 60;
                const prevExtrasDur = extraProcs.slice(0, idx).reduce((s, e) => s + (Number(e.duration) || 60), 0);
                const startMin = baseMin + mainDur + prevExtrasDur;
                const suggested = `${String(Math.floor(startMin / 60) % 24).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`;
                const shownTime = ex.edited && ex.time ? ex.time : suggested;
                return (
                  <div key={idx} className="flex items-center gap-2 mb-1.5 bg-bg2/50 rounded-xl px-2.5 py-2">
                    <input
                      type="time"
                      value={shownTime}
                      onChange={(e) => { const v = e.target.value; setExtraProcs((l) => l.map((it, i) => i === idx ? { ...it, time: v, edited: true } : it)); }}
                      className="text-[11px] font-mono text-gold bg-transparent border-none focus:outline-none w-[52px] shrink-0 cursor-pointer"
                      title="Horário de início (editável)"
                    />
                    <select
                      value={ex.procId}
                      onChange={(e) => {
                        const v = e.target.value;
                        const p = procs.find((ap) => ap.id === v);
                        setExtraProcs((l) => l.map((it, i) => i === idx ? { ...it, procId: v, duration: p?.duration_min ? String(p.duration_min) : it.duration } : it));
                      }}
                      className={`${inp} flex-1 border-none bg-card`}
                    >
                      <option value="">Procedimento...</option>
                      {procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select
                      value={ex.proId}
                      onChange={(e) => { const v = e.target.value; setExtraProcs((l) => l.map((it, i) => i === idx ? { ...it, proId: v } : it)); }}
                      className={`${inp} flex-1 border-none bg-card`}
                    >
                      <option value="">Profissional...</option>
                      {(() => {
                        const allowed = ex.procId ? procPros[ex.procId] : null;
                        const list = (allowed && allowed.length > 0) ? pros.filter((p) => allowed.includes(p.id)) : pros;
                        return list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>);
                      })()}
                    </select>
                    <button
                      type="button"
                      onClick={() => setExtraProcs((l) => l.filter((_, i) => i !== idx))}
                      className="p-1.5 rounded-lg text-text3 hover:text-danger hover:bg-danger/10 shrink-0"
                      title="Remover"
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-4 px-1">
            {!isEditing && (
              <label className="flex items-center gap-2 text-sm cursor-pointer border border-gold/40 rounded-lg px-3 py-2 bg-gold/5">
                <input type="checkbox" checked={forceOverlap} onChange={(e) => setForceOverlap(e.target.checked)} />
                <span>🔗 Forçar encaixe (permitir dois clientes no mesmo horário)</span>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm font-semibold text-navy cursor-pointer">
              <input type="checkbox" checked={isPreference} onChange={(e) => setIsPreference(e.target.checked)} />
              ⭐ Preferência da cliente por esta profissional
            </label>
            {isFirstVisit && (
              <div className="text-sm text-blue-600 font-semibold">🆕 Primeira vez na clínica (detectado automaticamente)</div>
            )}
          </div>

          {procId && (() => {
            const sel = procs.find((x) => x.id === procId);
            const avail = sel?.available ?? 0;
            return (
              <div className="bh-card p-3 space-y-2 border border-gold/40 bg-gold/5">
                <label className="flex items-center gap-2 text-sm font-semibold text-navy">
                  <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} disabled={avail < 2} />
                  Repetir semanalmente para todas as sessões deste pacote
                </label>
                {recurring && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-6">
                    <Field label="Dia da semana">
                      <select value={recWeekday} onChange={(e) => setRecWeekday(Number(e.target.value))} className={inp}>
                        {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((n, i) => <option key={i} value={i}>{n}</option>)}
                      </select>
                    </Field>
                    <Field label="Horário">
                      <input type="time" value={recTime} onChange={(e) => setRecTime(e.target.value)} className={inp} />
                    </Field>
                    <div className="text-xs text-text2 self-end pb-2 md:col-span-1">
                      Serão criados <b>{avail}</b> agendamentos (sessões restantes) toda <b>{["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][recWeekday]}</b> às <b>{recTime}</b>. Datas em ausência serão puladas.
                    </div>
                  </div>
                )}
                {avail < 2 && <div className="text-xs text-text3">Recorrência disponível quando o pacote tiver 2+ sessões restantes.</div>}
              </div>
            );
          })()}

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

type TermModalData = {
  clientName: string;
  clientId: string;
  clientCpf?: string | null;
  clientPhone?: string | null;
  procedureId: string;
  procedureName: string;
  termText: string;
  appointmentId: string;
  packageId: string | null;
};

function ApptViewModal({ appt, pros, canManage, onClose, onChanged }: { appt: Appt; pros: Professional[]; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [termModal, setTermModal] = useState<TermModalData | null>(null);
  const [termSource, setTermSource] = useState<"arrived" | "attendance">("arrived");

  const [termAsk, setTermAsk] = useState<TermModalData | null>(null);
  const [signSession, setSignSession] = useState<{ pkg: SignSessionPackage; session: SignSessionData } | null>(null);
  const dt = new Date(appt.datetime);
  const [confirmedByName, setConfirmedByName] = useState<string | null>(null);


  useEffect(() => {
    if (!appt.attendance_confirmed_by) { setConfirmedByName(null); return; }
    supabase.from("app_users").select("name").eq("id", appt.attendance_confirmed_by).maybeSingle()
      .then(({ data }) => setConfirmedByName((data as { name?: string } | null)?.name ?? null));
  }, [appt.attendance_confirmed_by]);

  const finishMarkArrived = async () => {
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("appointments")
      .update({ client_arrived_at: now, client_arrived_notified: true })
      .eq("id", appt.id);
    if (error) { setBusy(false); return toast.error(error.message); }
    const clientName = appt.clients?.name ?? "Cliente";
    const procName = appt.procedures?.name ?? "procedimento";
    const hora = new Date(appt.datetime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    await supabase.from("notifications").insert({
      type: "client_arrived",
      title: "🏠 Cliente chegou!",
      body: `${clientName} chegou e aguarda na recepção. Agendamento às ${hora} — ${procName}.`,
      user_id: appt.professional_id,
      target_roles: ["professional", "admin", "receptionist"],
      client_id: appt.client_id,
      appointment_id: appt.id,
      reference_id: appt.id,
      reference_type: "appointment",
      action_url: "/agenda",
      is_read: false,
    });
    toast.success(`✓ ${clientName} marcado como chegou! Profissional notificado.`);
    setBusy(false);
    setTermModal(null);
    onChanged();
  };

  const markClientArrived = async () => {
    if (appt.client_arrived_notified) {
      toast.info("Cliente já foi notificado como chegou.");
      return;
    }
    setBusy(true);
    try {
      if (appt.procedure_id) {
        const { data: proc } = await supabase
          .from("procedures")
          .select("requires_term, term_text, name")
          .eq("id", appt.procedure_id)
          .maybeSingle();

        if (proc?.requires_term && proc.term_text) {
          const { data: pkg } = await supabase
            .from("packages")
            .select("id")
            .eq("client_id", appt.client_id)
            .eq("procedure_id", appt.procedure_id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          setTermSource("arrived");
          setTermModal({
            clientName: appt.clients?.name ?? "Cliente",
            clientId: appt.client_id,
            clientCpf: appt.clients?.cpf ?? null,
            clientPhone: appt.clients?.phone ?? null,
            procedureId: appt.procedure_id,
            procedureName: proc.name,
            termText: proc.term_text,
            appointmentId: appt.id,
            packageId: pkg?.id ?? null,
          });

          setBusy(false);
          return;
        }
      }
      await finishMarkArrived();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao marcar chegada");
      setBusy(false);
    }
  };

  const confirmWithClient = async () => {
    setBusy(true);
    const { error } = await supabase.from("appointments").update({
      client_confirmed_at: new Date().toISOString(),
      client_confirmed_by: me?.id ?? null,
    }).eq("id", appt.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Confirmado com a cliente");
    onChanged();
  };

  const openSignForAttendance = async (packageId: string) => {
    const { data: pkgData } = await supabase
      .from("packages")
      .select("id,procedure_id,sess_total,sess_done,procedures(name,requires_term,term_text)")
      .eq("id", packageId)
      .maybeSingle();
    if (!pkgData) { toast.error("Pacote não encontrado."); return; }
    let { data: sess } = await supabase
      .from("sessions")
      .select("id,package_id,session_num")
      .eq("appointment_id", appt.id)
      .eq("status", "pending")
      .order("session_num")
      .limit(1)
      .maybeSingle();
    if (!sess) {
      const r = await supabase
        .from("sessions")
        .select("id,package_id,session_num")
        .eq("package_id", packageId)
        .eq("status", "pending")
        .order("session_num")
        .limit(1)
        .maybeSingle();
      sess = r.data;
    }
    if (!sess) { toast.error("Não há sessão pendente para assinar."); return; }
    setSignSession({ pkg: pkgData as unknown as SignSessionPackage, session: sess as unknown as SignSessionData });
  };

  const doConfirmAttendance = async () => {
    setBusy(true);
    const { error } = await supabase.from("appointments").update({
      attendance_status: "confirmed",
      attendance_confirmed_at: new Date().toISOString(),
      attendance_confirmed_by: me?.id ?? null,
      status: appt.status === "pending" ? "confirmed" : appt.status,
    }).eq("id", appt.id);
    setBusy(false);
    if (error) return toast.error(error.message);

    try {
      if (appt.procedure_id) {
        const { data: pkg } = await supabase
          .from("packages").select("id")
          .eq("client_id", appt.client_id)
          .eq("procedure_id", appt.procedure_id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (pkg?.id) {
          const { data: nextSession } = await supabase
            .from("sessions").select("id")
            .eq("package_id", pkg.id)
            .eq("status", "pending")
            .is("appointment_id", null)
            .order("session_num", { ascending: true })
            .limit(1).maybeSingle();
          if (nextSession?.id) {
            await supabase.from("sessions").update({ appointment_id: appt.id }).eq("id", nextSession.id);
          }
        }
      }
    } catch (e) {
      console.warn("[agenda] vínculo sessão-agendamento falhou:", e);
    }
    toast.success("Presença confirmada");
    onChanged();
  };

  const confirmAttendance = async () => {
    // Avulso: sem cliente cadastrado ou sem procedimento → redireciona para fechar pacote
    if (!appt.client_id || !appt.procedure_id) {
      toast.info("Sessão avulsa: selecione/finalize no Fechar Pacote para liberar a assinatura.");
      navigate({
        to: "/fechar-pacote",
        search: {
          clientId: appt.client_id || undefined,
          procedureId: appt.procedure_id || undefined,
        },
      });
      onClose();
      return;
    }
    // Verifica pacote ativo — sem pacote → avulso, redireciona para fechar venda
    const { data: pkg } = await supabase
      .from("packages").select("id")
      .eq("client_id", appt.client_id)
      .eq("procedure_id", appt.procedure_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (!pkg?.id) {
      toast.info("Sessão avulsa: finalize o pagamento no Fechar Pacote para liberar a assinatura.");
      navigate({ to: "/fechar-pacote", search: { clientId: appt.client_id, procedureId: appt.procedure_id } });
      onClose();
      return;
    }
    const { data: proc } = await supabase
      .from("procedures")
      .select("requires_term, term_text, name")
      .eq("id", appt.procedure_id)
      .maybeSingle();
    if (!proc?.requires_term || !proc.term_text) {
      await openSignForAttendance(pkg.id);
      return;
    }
    setTermAsk({
      clientName: appt.clients?.name ?? "Cliente",
      clientId: appt.client_id,
      clientCpf: appt.clients?.cpf ?? null,
      clientPhone: appt.clients?.phone ?? null,
      procedureId: appt.procedure_id,
      procedureName: proc.name,
      termText: proc.term_text,
      appointmentId: appt.id,
      packageId: pkg.id,
    });
  };


  const markNoShow = async () => {
    if (!window.confirm("Marcar cliente como FALTA?")) return;
    setBusy(true);
    const { error } = await supabase.from("appointments").update({
      attendance_status: "no_show",
      status: "cancelled",
    }).eq("id", appt.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Falta registrada");
    onChanged();
  };

  const remove = async () => {
    if (!window.confirm("Excluir agendamento?")) return;
    setBusy(true);
    await supabase
      .from("sessions")
      .update({ appointment_id: null })
      .eq("appointment_id", appt.id);
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
          {appt.attendance_status === "confirmed" && (
            <div className="bh-card p-2.5 bg-success/10 border border-success/30 text-success text-xs">
              ✓ Presença confirmada{confirmedByName ? ` por ${confirmedByName}` : ""}
              {appt.attendance_confirmed_at ? ` às ${new Date(appt.attendance_confirmed_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}` : ""}
              {" — "}Agenda: {dt.toLocaleDateString("pt-BR")} às {dt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
            </div>
          )}

          {canManage && (
          <div className="flex flex-wrap gap-2 pt-3 border-t">
            {!appt.client_arrived_at && appt.status !== "cancelled" && (
              <button
                type="button"
                onClick={markClientArrived}
                disabled={busy}
                className="px-3 py-1.5 rounded-md bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
              >
                🏠 Cliente Chegou
              </button>
            )}
            {appt.client_arrived_at && (
              <div className="px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold flex items-center gap-1 border border-blue-200">
                ✓ Chegou às {new Date(appt.client_arrived_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            {!appt.client_confirmed_at && appt.status !== "done" && appt.status !== "cancelled" && (
              <button type="button" onClick={confirmWithClient} disabled={busy} className="px-3 py-1.5 rounded-md bg-gold text-white text-xs font-bold hover:bg-gold/90 flex items-center gap-1">
                ★ Confirmado com cliente
              </button>
            )}
            {appt.client_confirmed_at && (
              <div className="px-3 py-1.5 rounded-md bg-gold/10 text-gold text-xs font-semibold flex items-center gap-1 border border-gold/30">
                ★ Confirmado com a cliente
              </div>
            )}
            {appt.attendance_status !== "confirmed" && appt.attendance_status !== "no_show" && (
              <button type="button" onClick={confirmAttendance} disabled={busy} className="px-3 py-1.5 rounded-md bg-success text-white text-xs font-bold hover:bg-success/90 flex items-center gap-1">
                ✓ Confirmar presença
              </button>
            )}
            {appt.attendance_status !== "no_show" && (
              <button type="button" onClick={markNoShow} disabled={busy} className="px-3 py-1.5 rounded-md bg-danger text-white text-xs font-bold hover:bg-danger/90">
                ✗ Falta
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy}
              className="px-3 py-1.5 rounded-md bg-gold/10 text-gold border border-gold/30 text-xs font-bold hover:bg-gold/20 flex items-center gap-1"
            >
              ✏️ Editar
            </button>
            <button type="button" onClick={remove} disabled={busy} className="ml-auto px-3 py-1.5 rounded-md text-text2 hover:text-danger text-xs font-semibold flex items-center gap-1">
              <IconTrash size={14} /> Excluir
            </button>
      </div>
          )}
      {editing && (
        <ApptModal
          initialDate={new Date(appt.datetime)}
          initialHour={toSPDate(new Date(appt.datetime)).getHours()}
          initialMin={toSPDate(new Date(appt.datetime)).getMinutes()}
          initialProId={appt.professional_id}
          editingApptId={appt.id}
          editingClientId={appt.client_id}
          editingProcId={appt.procedure_id ?? undefined}
          editingNotes={appt.notes ?? undefined}
          pros={pros}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onChanged(); }}
        />
      )}
      {termModal && (
        <TermConsentModal
          data={termModal}
          onCancel={() => { setTermModal(null); setBusy(false); }}
          onSigned={async (signatureData) => {
            const signedAt = new Date().toISOString();
            const { data: inserted } = await supabase
              .from("signed_terms")
              .insert({
                client_id: termModal.clientId,
                procedure_id: termModal.procedureId,
                package_id: termModal.packageId,
                term_text: termModal.termText,
                signature_data: signatureData,
                signed_at: signedAt,
              })
              .select("id")
              .single();
            const termId = (inserted as { id: string } | null)?.id;
            if (termId) {
              await supabase
                .from("sessions")
                .update({ signed_term_id: termId })
                .eq("appointment_id", termModal.appointmentId)
                .limit(1);
              // Fallback: vincula à próxima sessão pendente do pacote sem appointment_id
              if (termModal.packageId) {
                await supabase
                  .from("sessions")
                  .update({ signed_term_id: termId })
                  .eq("package_id", termModal.packageId)
                  .is("signed_term_id", null)
                  .limit(1);
              }
              // Arquiva PDF no storage (não bloqueia o fluxo se falhar)
              try {
                const clinic = await getClinicInfo();
                const blob = await generateTermPdf({
                  clientName: termModal.clientName,
                  clientCpf: termModal.clientCpf ?? null,
                  clientPhone: termModal.clientPhone ?? null,
                  procName: termModal.procedureName,
                  termText: termModal.termText,
                  signatureDataUrl: signatureData,
                  signedAt,
                  logoUrl: clinic.logo_url,
                  clinicName: clinic.name,
                  clinicAddress: clinic.address,
                  clinicCnpj: clinic.cnpj,
                });
                const path = `${termModal.clientId}/${termId}.pdf`;
                const { error: upErr } = await supabase.storage.from("signed-terms").upload(path, blob, { contentType: "application/pdf", upsert: true });
                // Salva o PATH (não a URL) — signed URL é gerada na hora de abrir
                if (!upErr) {
                  await supabase.from("signed_terms").update({ pdf_url: path }).eq("id", termId);
                }
              } catch (pdfErr) {
                console.warn("[term-pdf] upload falhou:", pdfErr);
              }
            }
            setTermModal(null);
            if (termSource === "attendance") {
              await openSignForAttendance(termModal!.packageId!);
            } else {
              await finishMarkArrived();
            }
          }}
        />
      )}
      {termAsk && (
        <div className="fixed inset-0 z-[60] bg-navy/70 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="font-display text-xl text-navy mb-2">Termo de Consentimento</div>
            <div className="text-sm text-text2 mb-4">
              <strong className="text-navy">{termAsk.clientName}</strong> já assinou o termo de consentimento para <strong>{termAsk.procedureName}</strong>?
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={async () => {
                  setTermAsk(null);
                  if (termAsk?.packageId) {
                    const { data: prevSess } = await supabase
                      .from("sessions")
                      .select("id, signed_term_id")
                      .eq("package_id", termAsk.packageId)
                      .not("signed_term_id", "is", null)
                      .limit(1)
                      .maybeSingle();

                    if (prevSess?.signed_term_id) {
                      // Sessão subsequente — vincula o termo existente
                      await supabase
                        .from("sessions")
                        .update({ signed_term_id: prevSess.signed_term_id })
                        .eq("appointment_id", termAsk.appointmentId)
                        .limit(1);
                      // Fallback por package_id (sessão sem appointment_id)
                      await supabase
                        .from("sessions")
                        .update({ signed_term_id: prevSess.signed_term_id })
                        .eq("package_id", termAsk.packageId)
                        .is("signed_term_id", null)
                        .limit(1);
                    } else {
                      // Primeira sessão do pacote — cria registro de termo sem assinatura digital
                      const signedAt = new Date().toISOString();
                      const { data: newTerm } = await supabase
                        .from("signed_terms")
                        .insert({
                          client_id: termAsk.clientId,
                          procedure_id: termAsk.procedureId,
                          package_id: termAsk.packageId,
                          term_text: termAsk.termText,
                          signature_data: null,
                          signed_at: signedAt,
                        })
                        .select("id")
                        .single();
                      if (newTerm?.id) {
                        await supabase
                          .from("sessions")
                          .update({ signed_term_id: newTerm.id })
                          .eq("appointment_id", termAsk.appointmentId)
                          .limit(1);
                        // Fallback por package_id (sessão sem appointment_id)
                        await supabase
                          .from("sessions")
                          .update({ signed_term_id: newTerm.id })
                          .eq("package_id", termAsk.packageId)
                          .is("signed_term_id", null)
                          .limit(1);
                      }
                    }
                  }
                  await openSignForAttendance(termAsk.packageId!);
                }}
                className="w-full px-3 py-2 rounded-md bg-success text-white text-sm font-bold hover:bg-success/90"
              >
                ✅ Sim, já assinou
              </button>
              <button
                type="button"
                onClick={() => { setTermSource("attendance"); setTermModal(termAsk); setTermAsk(null); }}
                className="w-full px-3 py-2 rounded-md bg-gold/15 text-navy border border-gold text-sm font-bold hover:bg-gold/25"
              >
                📋 Não, precisa assinar
              </button>
              <button
                type="button"
                onClick={() => setTermAsk(null)}
                className="w-full px-3 py-2 rounded-md text-text2 text-xs hover:bg-bg2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {signSession && (
        <SignSessionModal
          pkg={signSession.pkg}
          session={signSession.session}
          onClose={() => setSignSession(null)}
          onSaved={async () => {
            setSignSession(null);
            await doConfirmAttendance();
            onChanged();
          }}
        />
      )}

    </div>
      </div>
    </div>
  );
}

function BlockDayModal({ date, proId, proName, existingAppts, onClose, onSaved }: {
  date: Date; proId: string; proName: string; existingAppts: Appt[]; onClose: () => void; onSaved: () => void;
}) {
  const [absType, setAbsType] = useState<"vacation"|"absent"|"dayoff"|"leave">("dayoff");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const dayYmd = fmtDate(date);
  const dayLabel = date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const ABS_OPTIONS = [
    { value: "dayoff"   as const, label: "Folga",   color: "bg-blue-100 text-blue-700" },
    { value: "vacation" as const, label: "Férias",  color: "bg-purple-100 text-purple-700" },
    { value: "absent"   as const, label: "Falta",   color: "bg-danger/10 text-danger" },
    { value: "leave"    as const, label: "Licença", color: "bg-orange-100 text-orange-700" },
  ];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error: absErr } = await supabase.from("staff_absences").insert({
        user_id: proId,
        type: absType,
        date_start: dayYmd,
        date_end: dayYmd,
        notes: reason || null,
      });
      if (absErr) throw absErr;

      toast.success(`✓ Dia bloqueado para ${proName} — ${ABS_OPTIONS.find(o => o.value === absType)?.label}`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao bloquear dia");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-xl text-navy flex items-center gap-2">
            <IconCalendarOff size={20} /> Bloquear dia
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div className="text-sm text-text2">
            <b className="text-navy">{proName}</b>
            <br />
            <span className="capitalize">{dayLabel}</span>
          </div>
          {existingAppts.length > 0 && (
            <div className="rounded-lg border border-gold/40 bg-gold/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-navy">
                <IconAlertTriangle size={16} className="text-gold" />
                {existingAppts.length} agendamento{existingAppts.length > 1 ? "s" : ""} existente{existingAppts.length > 1 ? "s" : ""} neste dia
              </div>
              <ul className="space-y-1">
                {existingAppts.map((a) => {
                  const dt = new Date(a.datetime);
                  const time = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <li key={a.id} className="text-xs text-text2 flex items-center gap-2">
                      <span className="font-mono font-medium text-navy">{time}</span>
                      <span className="truncate">{a.clients?.name ?? "—"}</span>
                      <span className="text-text3">· {a.procedures?.name ?? "—"}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="text-[11px] text-text2">
                Esses agendamentos não serão cancelados automaticamente ao bloquear o dia.
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Tipo de bloqueio</label>
            <div className="flex flex-wrap gap-2">
              {ABS_OPTIONS.map((opt) => (
                <label key={opt.value} className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold border ${absType === opt.value ? opt.color + " border-current" : "bg-bg2 text-text2 border-border"}`}>
                  <input type="radio" name="absType" value={opt.value} checked={absType === opt.value} onChange={() => setAbsType(opt.value)} className="hidden" />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Motivo (opcional)</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: consulta médica, viagem..." className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-gold/40" />
          </div>
          <div className="text-[11px] text-text2 leading-relaxed bg-bg2 p-2.5 rounded-lg border border-border">
            ⚠️ Registra ausência na Escala e bloqueia 07:00–21:00 na Agenda. Agendamentos já existentes não serão cancelados automaticamente.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
              {busy ? "Bloqueando..." : "Bloquear dia"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-gold/40 text-sm";
function TermConsentModal({
  data,
  onCancel,
  onSigned,
}: {
  data: TermModalData;
  onCancel: () => void;
  onSigned: (signatureData: string) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [busy, setBusy] = useState(false);

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDrawing(true);
    setHasSigned(true);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const startDrawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDrawing(true);
    setHasSigned(true);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    ctx.beginPath();
    ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
  };

  const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
    ctx.stroke();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const generateTermPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Est. Beauty House Medicina e Estética", 20, 20);
    doc.setFontSize(11);
    doc.text("CNPJ: 68.438.126/0001-86", 20, 30);
    doc.text("Rua Pamplona, 925 — Jd. Paulista, São Paulo", 20, 38);
    doc.line(20, 44, 190, 44);
    doc.setFontSize(13);
    doc.text("Termo de Consentimento", 20, 54);
    doc.setFontSize(10);
    doc.text(`Cliente: ${data.clientName}`, 20, 65);
    doc.text(`Procedimento: ${data.procedureName}`, 20, 73);
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 20, 81);
    doc.line(20, 87, 190, 87);
    const lines = doc.splitTextToSize(data.termText, 170);
    doc.text(lines, 20, 97);
    const canvas = canvasRef.current;
    if (canvas) {
      const img = canvas.toDataURL("image/png");
      doc.addImage(img, "PNG", 20, 200, 80, 25);
    }
    doc.text("Assinatura da Cliente", 20, 230);
    doc.save(`Termo_${data.clientName.replace(/\s/g, "_")}_${data.procedureName.replace(/\s/g, "_")}.pdf`);
  };

  const handleSign = async () => {
    if (!hasSigned) return toast.error("Por favor, colete a assinatura da cliente antes de continuar.");
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureData = canvas.toDataURL("image/png");
    setBusy(true);
    await onSigned(signatureData);
    setBusy(false);
  };

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric"
  });

  return (
    <div className="fixed inset-0 z-[60] bg-navy/70 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg my-8">
        <div className="px-6 py-4 border-b bg-rose-50 rounded-t-xl">
          <div className="font-display text-xl text-navy">📋 Termo de Consentimento</div>
          <div className="text-xs text-text2 mt-1">
            Este procedimento exige assinatura antes de ser realizado
          </div>
        </div>
        <div className="px-6 py-3 bg-rose-50/50 border-b flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-navy">{data.clientName}</div>
            <div className="text-xs text-text2">{data.procedureName}</div>
          </div>
          <div className="text-xs text-text3">{today}</div>
        </div>
        <div className="px-6 py-4 max-h-48 overflow-y-auto border-b">
          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {data.termText}
          </div>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-text2 uppercase tracking-wide">
              Assinatura de <span className="text-navy">{data.clientName}</span>
            </div>
            <button
              type="button"
              onClick={clearCanvas}
              className="text-xs text-text3 hover:text-danger underline"
            >
              Limpar
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={420}
            height={120}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={() => setDrawing(false)}
            onMouseLeave={() => setDrawing(false)}
            onTouchStart={startDrawTouch}
            onTouchMove={drawTouch}
            onTouchEnd={() => setDrawing(false)}
            className="w-full border-2 border-dashed border-border rounded-lg bg-white cursor-crosshair touch-none"
            style={{ height: "120px" }}
          />
          {!hasSigned && (
            <div className="text-xs text-text3 text-center">
              ✍️ Peça para a cliente assinar acima com o dedo ou mouse
            </div>
          )}
        </div>
        <div className="mx-6 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-xs text-amber-800">
            ⚠️ <b>Atenção:</b> A cliente não poderá realizar o procedimento sem assinar este termo. A assinatura ficará salva na ficha da cliente.
          </div>
        </div>
        <div className="px-6 pb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border text-text2 hover:bg-bg2 text-sm font-semibold"
          >
            Cancelar — não confirmar chegada
          </button>
          {hasSigned && (
            <button
              type="button"
              onClick={generateTermPDF}
              className="px-4 py-2.5 rounded-lg border border-border text-text2 hover:bg-bg2 text-sm font-semibold"
            >
              📄 Baixar PDF do Termo
            </button>
          )}
          <button
            type="button"
            onClick={handleSign}
            disabled={!hasSigned || busy}
            className="flex-1 px-4 py-2.5 rounded-lg bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Salvando..." : "✅ Assinar e Confirmar Chegada"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>{children}</div>;
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-text2">{label}</span><span className="text-navy font-medium text-right">{value}</span></div>;
}

function SlotChoiceModal({ onClose, onAgendar, onFechar }: { onClose: () => void; onAgendar: () => void; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-xl text-navy">O que deseja fazer?</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          <button onClick={onAgendar} className="w-full px-4 py-3 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center justify-center gap-2">
            <IconCalendarEvent size={18} /> Agendar cliente
          </button>
          <button onClick={onFechar} className="w-full px-4 py-3 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 flex items-center justify-center gap-2">
            <IconLock size={18} /> Fechar horário
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockSlotModal({ date, hour, min, proId, proName, onClose, onSaved }: {
  date: Date; hour: number; min: number; proId: string; proName: string; onClose: () => void; onSaved: () => void;
}) {
  const [duration, setDuration] = useState("60");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const dt = new Date(date);
      dt.setHours(hour, min, 0, 0);
      const dur = Number(duration) || 60;
      const { error } = await supabase.from("appointments").insert({
        professional_id: proId,
        datetime: dt.toISOString(),
        duration_min: dur,
        status: "blocked",
        notes: reason || null,
        client_id: null,
        procedure_id: null,
      });
      if (error) throw error;
      toast.success("Horário fechado!");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao fechar horário");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-xl text-navy flex items-center gap-2"><IconLock size={20} /> Fechar horário</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="text-sm text-text2">
            <b className="text-navy">{proName}</b> · {date.toLocaleDateString("pt-BR")} às {String(hour).padStart(2,"0")}:{String(min).padStart(2,"0")}
          </div>
          <Field label="Duração (min)*">
            <input type="number" min={1} step={1} value={duration} onChange={(e) => setDuration(e.target.value)} className={inp} required />
          </Field>
          <Field label="Motivo">
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: almoço, reunião, indisponível" className={inp} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
              {busy ? "Salvando..." : "Fechar horário"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
