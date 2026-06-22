import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconPlayerPlay, IconCoffee, IconCoffeeOff, IconLogout } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  computeTotalMinutes,
  formatHM,
  formatHM_HHmm,
  todayISO,
  type TimeEntry,
} from "@/lib/timeUtils";

export const Route = createFileRoute("/_authenticated/meu-ponto")({
  component: MeuPontoPage,
});

function MeuPontoPage() {
  const { user: me } = useAuth();
  const allowed = !!me?.permissions?.meu_ponto;

  const [today, setToday] = useState<TimeEntry | null>(null);
  const [history, setHistory] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const date = todayISO();

  const load = useCallback(async () => {
    if (!me?.id) return;
    setLoading(true);
    const t = await supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", me.id)
      .eq("date", date)
      .maybeSingle();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const startStr = since.toISOString().slice(0, 10);
    const h = await supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", me.id)
      .gte("date", startStr)
      .order("date", { ascending: false });
    setToday((t.data as TimeEntry) ?? null);
    setHistory((h.data as TimeEntry[]) ?? []);
    setLoading(false);
  }, [me?.id, date]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const upsert = async (patch: Partial<TimeEntry>) => {
    if (!me?.id) return;
    setBusy(true);
    const row = {
      user_id: me.id,
      date,
      clock_in: today?.clock_in ?? null,
      break_start: today?.break_start ?? null,
      break_end: today?.break_end ?? null,
      clock_out: today?.clock_out ?? null,
      note: today?.note ?? null,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("time_entries")
      .upsert(row, { onConflict: "user_id,date" });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ponto registrado");
    void load();
  };

  const liveTotal = useMemo(() => {
    if (!today?.clock_in) return 0;
    const fake: TimeEntry = {
      ...today,
      clock_out: today.clock_out ?? now.toISOString(),
    };
    return computeTotalMinutes(fake);
  }, [today, now]);

  const canIn = !today?.clock_in;
  const canBreakStart = !!today?.clock_in && !today?.break_start && !today?.clock_out;
  const canBreakEnd = !!today?.break_start && !today?.break_end;
  const canOut =
    !!today?.clock_in &&
    !today?.clock_out &&
    (!today?.break_start || !!today?.break_end);

  if (!me) return null;
  if (!allowed) {
    return (
      <div className="bh-card p-12 text-center text-text3">
        Você não tem permissão para o módulo "Meu Ponto". Solicite ao administrador.
      </div>
    );
  }

  const todayBR = new Date(date + "T00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const nowHM = now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="bh-card p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="font-display text-3xl text-navy">Meu Ponto</div>
            <div className="text-text2 text-sm capitalize">{todayBR}</div>
            <div className="text-text3 text-xs mt-1">Olá, {me.name}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase font-semibold text-text2">Horário atual</div>
            <div className="font-display text-4xl text-gold leading-none">{nowHM}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ActionButton
          label="Entrada"
          icon={<IconPlayerPlay size={28} />}
          color="bg-green-600 hover:bg-green-700"
          disabled={!canIn || busy}
          onClick={() => upsert({ clock_in: new Date().toISOString() })}
        />
        <ActionButton
          label="Iniciar Pausa"
          icon={<IconCoffee size={28} />}
          color="bg-yellow-500 hover:bg-yellow-600"
          disabled={!canBreakStart || busy}
          onClick={() => upsert({ break_start: new Date().toISOString() })}
        />
        <ActionButton
          label="Fim Pausa"
          icon={<IconCoffeeOff size={28} />}
          color="bg-yellow-700 hover:bg-yellow-800"
          disabled={!canBreakEnd || busy}
          onClick={() => upsert({ break_end: new Date().toISOString() })}
        />
        <ActionButton
          label="Saída"
          icon={<IconLogout size={28} />}
          color="bg-navy hover:bg-navy2"
          disabled={!canOut || busy}
          onClick={() => upsert({ clock_out: new Date().toISOString() })}
        />
      </div>

      <div className="bh-card p-5">
        <div className="font-display text-xl text-navy mb-3">Registros de hoje</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Slot label="Entrada" value={formatHM_HHmm(today?.clock_in ?? null)} />
          <Slot label="Início pausa" value={formatHM_HHmm(today?.break_start ?? null)} />
          <Slot label="Fim pausa" value={formatHM_HHmm(today?.break_end ?? null)} />
          <Slot label="Saída" value={formatHM_HHmm(today?.clock_out ?? null)} />
        </div>
        <div className="mt-4 pt-3 border-t flex items-center justify-between">
          <span className="text-text2 text-sm">Total trabalhado hoje</span>
          <span className="font-display text-2xl text-navy">{formatHM(liveTotal)}</span>
        </div>
      </div>

      <div className="bh-card p-5">
        <div className="font-display text-xl text-navy mb-3">Histórico (últimos 30 dias)</div>
        {loading ? (
          <div className="p-6 text-center text-text3 text-sm">Carregando…</div>
        ) : history.length === 0 ? (
          <div className="p-6 text-center text-text3 text-sm">Nenhum registro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg2 text-text2">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Data</th>
                  <th className="text-left px-3 py-2 font-semibold">Entrada</th>
                  <th className="text-left px-3 py-2 font-semibold">Pausa ini</th>
                  <th className="text-left px-3 py-2 font-semibold">Pausa fim</th>
                  <th className="text-left px-3 py-2 font-semibold">Saída</th>
                  <th className="text-right px-3 py-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => {
                  const total = computeTotalMinutes(r);
                  return (
                    <tr key={r.id ?? r.date} className={i % 2 ? "bg-bg2/40" : ""}>
                      <td className="px-3 py-2 font-semibold text-navy">
                        {new Date(r.date + "T00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-text2">{formatHM_HHmm(r.clock_in)}</td>
                      <td className="px-3 py-2 text-text2">{formatHM_HHmm(r.break_start)}</td>
                      <td className="px-3 py-2 text-text2">{formatHM_HHmm(r.break_end)}</td>
                      <td className="px-3 py-2 text-text2">{formatHM_HHmm(r.clock_out)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-navy">{formatHM(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  color,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl text-white py-6 font-semibold shadow-sm transition-colors ${color} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {icon}
      <span className="text-sm uppercase tracking-wide">{label}</span>
    </button>
  );
}

function Slot({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg2/40 px-3 py-2">
      <div className="text-[10px] uppercase font-semibold text-text3 tracking-wide">{label}</div>
      <div className="font-display text-xl text-navy">{value}</div>
    </div>
  );
}
