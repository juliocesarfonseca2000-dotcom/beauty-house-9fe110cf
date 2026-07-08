import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconCheck, IconX, IconBell } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lembretes")({
  component: LembretesPage,
});

type Reminder = {
  id: string;
  text: string;
  remind_date: string;
  remind_time: string | null;
  responsible_id: string | null;
  created_by: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
};

type Pro = { id: string; name: string };

function todaySP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function ymd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function LembretesPage() {
  const { user } = useAuth();
  const [view, setView] = useState<"dia" | "mes">("dia");
  const [cursor, setCursor] = useState(() => new Date());
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [pros, setPros] = useState<Pro[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [fText, setFText] = useState("");
  const [fDate, setFDate] = useState(todaySP());
  const [fTime, setFTime] = useState("");
  const [fResp, setFResp] = useState("");

  const nameById = useMemo(() => {
    const m: Record<string, string> = {};
    pros.forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [pros]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("reminders")
      .select("*")
      .order("remind_date", { ascending: true })
      .order("remind_time", { ascending: true, nullsFirst: true });
    setReminders((data as Reminder[]) ?? []);
  }, []);

  useEffect(() => {
    supabase.from("app_users").select("id,name").eq("active", true).order("name").then(({ data }) => {
      setPros((data as Pro[]) ?? []);
    });
    load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("reminders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "reminders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const create = async () => {
    if (!fText.trim()) { toast.error("Escreva o lembrete"); return; }
    const { error } = await supabase.from("reminders").insert({
      text: fText.trim(),
      remind_date: fDate,
      remind_time: fTime || null,
      responsible_id: fResp || null,
      created_by: user?.id ?? null,
      done: false,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Lembrete criado!");
    setFText(""); setFTime(""); setFResp(""); setShowForm(false);
    load();
  };

  const toggleDone = async (r: Reminder) => {
    const { error } = await supabase.from("reminders")
      .update({ done: !r.done, done_at: !r.done ? new Date().toISOString() : null })
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const remove = async (r: Reminder) => {
    if (!window.confirm("Excluir este lembrete?")) return;
    const { error } = await supabase.from("reminders").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const isOverdue = (r: Reminder) => !r.done && r.remind_date < todaySP();

  const dayStr = ymd(cursor);
  const dayList = reminders.filter((r) => r.remind_date === dayStr);
  const monthList = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const groups: Record<string, Reminder[]> = {};
    reminders.forEach((r) => {
      const [ry, rm] = r.remind_date.split("-").map(Number);
      if (ry === y && rm === m + 1) {
        (groups[r.remind_date] ??= []).push(r);
      }
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [reminders, cursor]);

  const navDay = (delta: number) => { const d = new Date(cursor); d.setDate(d.getDate() + delta); setCursor(d); };
  const navMonth = (delta: number) => { const d = new Date(cursor); d.setMonth(d.getMonth() + delta); setCursor(d); };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <IconBell size={24} className="text-gold" />
          <h1 className="font-display text-2xl text-navy">Lembretes</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy/90">
          <IconPlus size={16} /> Novo lembrete
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button onClick={() => setView("dia")} className={`px-4 py-1.5 text-sm font-medium ${view === "dia" ? "bg-gold text-white" : "bg-card text-text2"}`}>Dia</button>
          <button onClick={() => setView("mes")} className={`px-4 py-1.5 text-sm font-medium ${view === "mes" ? "bg-gold text-white" : "bg-card text-text2"}`}>Mês</button>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => (view === "dia" ? navDay(-1) : navMonth(-1))} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconChevronLeft size={18} /></button>
          <span className="text-sm font-medium text-navy min-w-[140px] text-center">
            {view === "dia"
              ? cursor.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
              : `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`}
          </span>
          <button onClick={() => (view === "dia" ? navDay(1) : navMonth(1))} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconChevronRight size={18} /></button>
        </div>
      </div>

      {showForm && (
        <div className="bh-card p-4 mb-4 border border-gold/30 bg-gold/5">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-navy text-sm">Novo lembrete</span>
            <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-bg2 text-text3"><IconX size={16} /></button>
          </div>
          <div className="space-y-3">
            <input value={fText} onChange={(e) => setFText(e.target.value)} placeholder="O que lembrar? (ex: comprar toalhas, mandar mensagem para a cliente...)" className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-xs text-text2">
                Data
                <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text2">
                Hora
                <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text2 flex-1 min-w-[160px]">
                Responsável
                <select value={fResp} onChange={(e) => setFResp(e.target.value)} className="px-2 py-1.5 rounded-lg border border-border text-sm">
                  <option value="">Ninguém específico</option>
                  {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>
            <div className="flex justify-end">
              <button onClick={create} className="px-4 py-2 rounded-lg bg-success text-white text-sm font-semibold hover:bg-success/90">Salvar lembrete</button>
            </div>
          </div>
        </div>
      )}

      {view === "dia" && (
        <div className="space-y-2">
          {dayList.length === 0 && <div className="text-center text-text3 py-10 text-sm">Nenhum lembrete para este dia.</div>}
          {dayList.map((r) => <ReminderCard key={r.id} r={r} overdue={isOverdue(r)} nameById={nameById} onToggle={toggleDone} onRemove={remove} />)}
        </div>
      )}

      {view === "mes" && (
        <div className="space-y-4">
          {monthList.length === 0 && <div className="text-center text-text3 py-10 text-sm">Nenhum lembrete neste mês.</div>}
          {monthList.map(([date, list]) => (
            <div key={date}>
              <div className="text-xs font-semibold text-gold uppercase tracking-wide mb-2">
                {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </div>
              <div className="space-y-2">
                {list.map((r) => <ReminderCard key={r.id} r={r} overdue={isOverdue(r)} nameById={nameById} onToggle={toggleDone} onRemove={remove} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReminderCard({ r, overdue, nameById, onToggle, onRemove }: {
  r: Reminder;
  overdue: boolean;
  nameById: Record<string, string>;
  onToggle: (r: Reminder) => void;
  onRemove: (r: Reminder) => void;
}) {
  const bg = r.done ? "bg-bg2/40 border-border" : overdue ? "bg-danger/5 border-danger/30" : "bg-card border-border";
  return (
    <div className={`bh-card p-3 border flex items-start gap-3 ${bg}`}>
      <button
        onClick={() => onToggle(r)}
        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${r.done ? "bg-success border-success text-white" : "border-gold hover:bg-gold/10"}`}
        title={r.done ? "Concluído" : "Marcar como concluído"}
      >
        {r.done && <IconCheck size={13} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${r.done ? "line-through text-text3" : "text-navy"}`}>{r.text}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs">
          {r.remind_time && <span className="text-text2">🕐 {r.remind_time.slice(0, 5)}</span>}
          {overdue && <span className="text-danger font-semibold">⚠️ Atrasado</span>}
          {r.responsible_id && nameById[r.responsible_id] && (
            <span className="text-gold font-medium">👤 {nameById[r.responsible_id]}</span>
          )}
          {r.created_by && nameById[r.created_by] && (
            <span className="text-text3">criado por {nameById[r.created_by]}</span>
          )}
        </div>
      </div>
      <button onClick={() => onRemove(r)} className="p-1.5 rounded text-text3 hover:text-danger hover:bg-danger/10 shrink-0" title="Excluir">
        <IconTrash size={15} />
      </button>
    </div>
  );
}
