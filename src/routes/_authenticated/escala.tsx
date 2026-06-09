import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

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
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }

function EscalaPage() {
  const { user: me } = useAuth();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [pros, setPros] = useState<Pro[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const dim = daysInMonth(y, m);
  const monthStart = useMemo(() => `${y}-${pad(m + 1)}-01`, [y, m]);
  const monthEnd = useMemo(() => `${y}-${pad(m + 1)}-${pad(dim)}`, [y, m, dim]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const proRes = me?.role === "professional"
        ? await supabase.from("app_users").select("id,name").eq("id", me.id)
        : await supabase.from("app_users").select("id,name").eq("active", true).in("role", ["professional"]).order("name");
      const absRes = await supabase
        .from("staff_absences")
        .select("id,user_id,type,date_start,date_end")
        .lte("date_start", monthEnd)
        .gte("date_end", monthStart);
      if (!active) return;
      if (proRes.error) toast.error(proRes.error.message);
      if (absRes.error) toast.error(absRes.error.message);
      setPros((proRes.data as Pro[]) ?? []);
      setAbsences((absRes.data as Absence[]) ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [monthStart, monthEnd, me?.id, me?.role]);

  const days = Array.from({ length: dim }, (_, i) => i + 1);

  const cellFor = (userId: string, day: number): Absence | null => {
    const date = `${y}-${pad(m + 1)}-${pad(day)}`;
    return absences.find((a) => a.user_id === userId && a.date_start <= date && a.date_end >= date) ?? null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(y, m - 1, 1))} className="p-2 rounded-lg hover:bg-bg2 border border-border"><IconChevronLeft size={18} /></button>
          <div className="font-display text-xl text-navy capitalize min-w-[160px] text-center">
            {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </div>
          <button onClick={() => setCursor(new Date(y, m + 1, 1))} className="p-2 rounded-lg hover:bg-bg2 border border-border"><IconChevronRight size={18} /></button>
          <button onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setCursor(d); }} className="ml-2 px-3 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-bg2">Hoje</button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["vacation","absent","dayoff","leave"] as const).map((t) => (
            <span key={t} className={`px-2 py-1 rounded ${TYPE_COLOR[t]}`}>{TYPE_LABEL[t]}</span>
          ))}
          {me?.role === "admin" && <Link to="/usuarios" className="px-3 py-1.5 rounded-md border border-border text-text2 hover:bg-bg2">Editar em Usuários →</Link>}
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
                        {a ? <div className={`${TYPE_COLOR[a.type]} h-7 mx-px rounded text-[10px] flex items-center justify-center`}>{TYPE_LABEL[a.type][0]}</div> : <div className="h-7" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
