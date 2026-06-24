import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { computeTotalMinutes } from "@/lib/timeUtils";

export const Route = createFileRoute("/_authenticated/meu-ponto")({
  component: MeuPontoPage,
});

type PontoEntry = {
  id: string;
  user_id: string;
  date: string;
  clock_in: string | null;
  break_start: string | null;
  break_end: string | null;
  clock_out: string | null;
};

type Absence = {
  id: string;
  user_id: string;
  type: "vacation" | "absent" | "dayoff" | "leave";
  date_start: string;
  date_end: string;
  note: string | null;
};

const TYPE_LABEL: Record<Absence["type"], string> = {
  vacation: "Férias", absent: "Falta", dayoff: "Folga", leave: "Licença",
};

const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "—";

const fmtDuration = (min: number) => {
  if (!min) return "—";
  return `${Math.floor(min / 60)}h${pad(min % 60)}`;
};

function MeuPontoPage() {
  const { user: me } = useAuth();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [entries, setEntries] = useState<PontoEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  const y = cursor.getFullYear();
  const mo = cursor.getMonth();
  const dim = daysInMonth(y, mo);
  const monthStart = `${y}-${pad(mo + 1)}-01`;
  const monthEnd = `${y}-${pad(mo + 1)}-${pad(dim)}`;

  useEffect(() => {
    if (!me?.id) return;
    setLoading(true);
    Promise.all([
      supabase.from("time_entries").select("*").eq("user_id", me.id).gte("date", monthStart).lte("date", monthEnd).order("date", { ascending: false }),
      supabase.from("staff_absences").select("*").eq("user_id", me.id).lte("date_start", monthEnd).gte("date_end", monthStart),
    ]).then(([entRes, absRes]) => {
      setEntries((entRes.data as PontoEntry[]) ?? []);
      setAbsences((absRes.data as Absence[]) ?? []);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, monthEnd, me?.id]);

  const todayStr = (() => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`; })();
  const totalMinutes = entries.reduce((acc, e) => acc + computeTotalMinutes(e), 0);
  const daysPresent = entries.filter((e) => !!e.clock_in).length;
  const absenceDays = useMemo(() => absences.reduce((acc, a) => {
    const dt = new Date(a.date_start + "T00:00:00");
    const end = new Date(a.date_end + "T00:00:00");
    let n = 0;
    while (dt <= end) { n++; dt.setDate(dt.getDate() + 1); }
    return acc + n;
  }, 0), [absences]);

  const firstWeekday = new Date(y, mo, 1).getDay();
  const calCells = useMemo(() => {
    const totalCells = Math.ceil((firstWeekday + dim) / 7) * 7;
    return Array.from({ length: totalCells }, (_, idx) => {
      const dayNum = idx - firstWeekday + 1;
      if (dayNum < 1 || dayNum > dim) return null;
      const iso = `${y}-${pad(mo + 1)}-${pad(dayNum)}`;
      const entry = entries.find((e) => e.date === iso);
      const absence = absences.find((a) => a.date_start <= iso && a.date_end >= iso);
      let bg = "";
      if (absence) { bg = absence.type === "absent" ? "#FFEBEE" : "#F5F5F5"; }
      else if (entry?.clock_in && entry?.clock_out) { bg = "#E8F5E9"; }
      return { dayNum, iso, bg };
    });
  }, [y, mo, dim, firstWeekday, entries, absences]);

  const tableRows = useMemo(() => {
    const isoSet = new Set<string>(entries.map((e) => e.date));
    absences.forEach((a) => {
      const dt = new Date(a.date_start + "T00:00:00");
      const end = new Date(a.date_end + "T00:00:00");
      while (dt <= end) {
        const iso = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
        if (iso >= monthStart && iso <= monthEnd) isoSet.add(iso);
        dt.setDate(dt.getDate() + 1);
      }
    });
    return Array.from(isoSet).sort().reverse().map((iso) => ({
      iso,
      entry: entries.find((e) => e.date === iso) ?? null,
      absence: absences.find((a) => a.date_start <= iso && a.date_end >= iso) ?? null,
    }));
  }, [entries, absences, monthStart, monthEnd]);

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  if (!me) return null;
  if (!me.permissions?.meu_ponto) return (
    <div className="flex items-center justify-center h-64 text-text2 text-sm">
      Você não tem permissão para acessar esta página.
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl text-navy">
          Meu Ponto — {me.name} — <span className="capitalize">{monthLabel}</span>
        </h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCursor(new Date(y, mo - 1, 1))} className="p-2 rounded-lg hover:bg-bg2 border border-border"><IconChevronLeft size={18} /></button>
          <button type="button" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setCursor(d); }} className="px-3 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-bg2">Hoje</button>
          <button type="button" onClick={() => setCursor(new Date(y, mo + 1, 1))} className="p-2 rounded-lg hover:bg-bg2 border border-border"><IconChevronRight size={18} /></button>
        </div>
      </div>

      {loading ? (
        <div className="bh-card p-8 text-center text-text3 text-sm">Carregando…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bh-card p-5 text-center">
              <div className="text-3xl font-bold text-navy">{fmtDuration(totalMinutes)}</div>
              <div className="text-xs text-text2 mt-1.5">Total de Horas Trabalhadas</div>
            </div>
            <div className="bh-card p-5 text-center">
              <div className="text-3xl font-bold text-navy">{daysPresent}</div>
              <div className="text-xs text-text2 mt-1.5">Dias Presentes</div>
            </div>
            <div className="bh-card p-5 text-center">
              <div className="text-3xl font-bold text-navy">{absenceDays}</div>
              <div className="text-xs text-text2 mt-1.5">Dias de Ausência</div>
            </div>
          </div>

          <div className="bh-card p-4">
            <div className="text-xs font-semibold text-text2 uppercase tracking-wide mb-3">
              Calendário — <span className="capitalize">{monthLabel}</span>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS_SHORT.map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-text3 uppercase">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calCells.map((cell, idx) =>
                cell === null ? <div key={idx} /> : (
                  <div
                    key={cell.iso}
                    style={{ backgroundColor: cell.bg || "#FFFFFF" }}
                    className={`aspect-square rounded flex items-center justify-center text-xs font-medium border ${cell.iso === todayStr ? "border-gold ring-1 ring-gold font-bold" : "border-border/30"}`}
                  >
                    {cell.dayNum}
                  </div>
                )
              )}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-[10px] text-text2">
              {([["#E8F5E9","Ponto completo"],["#F5F5F5","Folga / Férias / Licença"],["#FFEBEE","Falta"],["","Sem registro"]] as [string,string][]).map(([bg, label]) => (
                <span key={label} className="flex items-center gap-1">
                  <span style={{ background: bg || "#FFFFFF" }} className="inline-block w-3 h-3 rounded border border-border/40 shrink-0" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="bh-card overflow-x-auto">
            <div className="px-4 py-3 border-b">
              <div className="text-xs font-semibold text-text2 uppercase tracking-wide">Registros do mês</div>
            </div>
            {tableRows.length === 0 ? (
              <div className="px-4 py-10 text-center text-text3 text-sm">Nenhum registro neste mês.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-bg2 text-text2 text-xs">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Data</th>
                    <th className="text-center px-3 py-3 font-semibold">Entrada</th>
                    <th className="text-center px-3 py-3 font-semibold">Início Pausa</th>
                    <th className="text-center px-3 py-3 font-semibold">Fim Pausa</th>
                    <th className="text-center px-3 py-3 font-semibold">Saída</th>
                    <th className="text-center px-3 py-3 font-semibold">Total de Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map(({ iso, entry, absence }) => {
                    const min = entry ? computeTotalMinutes(entry) : 0;
                    const absLabel = absence && !entry ? TYPE_LABEL[absence.type] : null;
                    return (
                      <tr key={iso} className="border-t hover:bg-bg2/30">
                        <td className="px-4 py-2.5 text-navy font-medium whitespace-nowrap">
                          {new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                        </td>
                        {absLabel ? (
                          <td colSpan={5} className="px-3 py-2.5 text-center text-xs text-text3 italic">{absLabel}</td>
                        ) : (
                          <>
                            <td className="px-3 py-2.5 text-center text-text2">{fmtTime(entry?.clock_in ?? null)}</td>
                            <td className="px-3 py-2.5 text-center text-text2">{fmtTime(entry?.break_start ?? null)}</td>
                            <td className="px-3 py-2.5 text-center text-text2">{fmtTime(entry?.break_end ?? null)}</td>
                            <td className="px-3 py-2.5 text-center text-text2">{fmtTime(entry?.clock_out ?? null)}</td>
                            <td className="px-3 py-2.5 text-center font-semibold text-navy">{fmtDuration(min)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
