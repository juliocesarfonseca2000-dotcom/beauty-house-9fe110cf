import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconSearch, IconPlayerPlay, IconCoffee, IconCoffeeOff, IconLogout, IconUser, IconArrowLeft } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { todayISO, type TimeEntry } from "@/lib/timeUtils";

export const Route = createFileRoute("/_authenticated/kiosk-ponto")({
  component: KioskPontoPage,
});

type Person = {
  id: string;
  name: string;
  email: string;
  cargo: string | null;
  role: string;
  avatar_url: string | null;
  cpf: string | null;
};

function KioskPontoPage() {
  const { user, authReady, signOut } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [today, setToday] = useState<TimeEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Busca por nome, email ou cpf
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("app_users")
        .select("id,name,email,cargo,role,avatar_url,cpf")
        .eq("active", true)
        .neq("is_kiosk", true)
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,cpf.ilike.%${q}%`)
        .limit(8);
      setResults(((data ?? []) as Person[]).filter((p) => p.role !== "admin"));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // Carrega ponto do dia ao selecionar
  useEffect(() => {
    if (!selected) { setToday(null); return; }
    void (async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", selected.id)
        .eq("date", todayISO())
        .maybeSingle();
      setToday((data as TimeEntry) ?? null);
    })();
  }, [selected]);

  const upsert = async (patch: Partial<TimeEntry>) => {
    if (!selected) return;
    setBusy(true);
    const row = {
      user_id: selected.id,
      date: todayISO(),
      clock_in: today?.clock_in ?? null,
      break_start: today?.break_start ?? null,
      break_end: today?.break_end ?? null,
      clock_out: today?.clock_out ?? null,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("time_entries").upsert(row, { onConflict: "user_id,date" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Ponto registrado, ${selected.name.split(" ")[0]}! Até logo`, { duration: 3500 });
    // Volta para tela de identificação
    setTimeout(() => {
      setSelected(null);
      setQuery("");
      setResults([]);
      setToday(null);
    }, 1500);
  };

  const canIn = !today?.clock_in;
  const canBreakStart = !!today?.clock_in && !today?.break_start && !today?.clock_out;
  const canBreakEnd = !!today?.break_start && !today?.break_end;
  const canOut = !!today?.clock_in && !today?.clock_out && (!today?.break_start || !!today?.break_end);

  if (!user) return null;

  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 bg-navy text-white flex flex-col items-center justify-center p-6 z-40">
      <button
        type="button"
        onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
        className="absolute top-4 right-4 text-xs px-3 py-1.5 rounded border border-white/20 hover:bg-white/10"
      >
        Sair do kiosk
      </button>
      <div className="absolute top-4 left-6 text-xs uppercase tracking-widest text-silver/70">
        {nowHM} · Beauty House
      </div>

      {!selected ? (
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="font-display text-5xl text-white mb-2">Identifique-se</div>
            <div className="text-silver/80">Digite seu nome, CPF ou email</div>
          </div>
          <div className="relative">
            <IconSearch size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-silver/60" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-12 pr-4 py-4 rounded-xl bg-white/10 border border-white/20 text-white text-lg placeholder:text-silver/50 focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>
          {results.length > 0 && (
            <div className="mt-4 space-y-2">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition"
                >
                  <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center overflow-hidden">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <IconUser size={24} className="text-gold" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-xl text-white truncate">{p.name}</div>
                    <div className="text-silver/70 text-sm truncate">{p.cargo ?? p.role}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {query.length >= 2 && results.length === 0 && (
            <div className="mt-6 text-center text-silver/60">Nenhum funcionário encontrado.</div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-3xl">
          <button
            type="button"
            onClick={() => { setSelected(null); setQuery(""); }}
            className="mb-4 inline-flex items-center gap-2 text-silver/80 hover:text-white text-sm"
          >
            <IconArrowLeft size={16} /> Voltar
          </button>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center mb-6">
            <div className="w-20 h-20 rounded-full bg-gold/20 mx-auto mb-3 flex items-center justify-center overflow-hidden">
              {selected.avatar_url ? (
                <img src={selected.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <IconUser size={40} className="text-gold" />
              )}
            </div>
            <div className="font-display text-3xl text-white">{selected.name}</div>
            <div className="text-silver/70">{selected.cargo ?? selected.role}</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KioskBtn label="Entrada" icon={<IconPlayerPlay size={32} />} color="bg-green-600 hover:bg-green-700"
              disabled={!canIn || busy} onClick={() => upsert({ clock_in: new Date().toISOString() })} />
            <KioskBtn label="Iniciar Pausa" icon={<IconCoffee size={32} />} color="bg-yellow-500 hover:bg-yellow-600"
              disabled={!canBreakStart || busy} onClick={() => upsert({ break_start: new Date().toISOString() })} />
            <KioskBtn label="Fim Pausa" icon={<IconCoffeeOff size={32} />} color="bg-yellow-700 hover:bg-yellow-800"
              disabled={!canBreakEnd || busy} onClick={() => upsert({ break_end: new Date().toISOString() })} />
            <KioskBtn label="Saída" icon={<IconLogout size={32} />} color="bg-gold hover:bg-gold2"
              disabled={!canOut || busy} onClick={() => upsert({ clock_out: new Date().toISOString() })} />
          </div>
        </div>
      )}
    </div>
  );
}

function KioskBtn({ label, icon, color, disabled, onClick }: {
  label: string; icon: React.ReactNode; color: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl text-white py-8 font-semibold shadow transition-colors ${color} disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {icon}
      <span className="text-sm uppercase tracking-wide">{label}</span>
    </button>
  );
}
