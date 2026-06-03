import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { IconUserPlus, IconClipboardHeart, IconPackage, IconCoin, IconBoxSeam } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/with-timeout";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", dayStart.toISOString()],
    queryFn: async () => {
      const [appts, clients, products] = await Promise.all([
        withTimeout(supabase.from("appointments").select("id,datetime,status,clients(name),procedures(name)").gte("datetime", dayStart.toISOString()).lt("datetime", dayEnd.toISOString()).neq("status", "cancelled").order("datetime"), 10000, "Atendimentos de hoje"),
        withTimeout(supabase.from("clients").select("id", { count: "exact", head: true }).eq("active", true), 10000, "Clientes ativas"),
        withTimeout(supabase.from("products").select("id,qty_current,qty_min,name").eq("active", true), 10000, "Estoque crítico"),
      ]);
      if (appts.error) throw appts.error;
      if (clients.error) throw clients.error;
      if (products.error) throw products.error;
      const stockCritical = ((products.data as Array<{ qty_current: number | null; qty_min: number | null }> | null) ?? [])
        .filter((p) => Number(p.qty_current ?? 0) <= Number(p.qty_min ?? 0)).length;
      return {
        appointments: (appts.data as Array<{ id: string; datetime: string; status: string; clients: { name: string } | null; procedures: { name: string } | null }> | null) ?? [],
        activeClients: clients.count ?? 0,
        stockCritical,
      };
    },
  });
  const fmt = now.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div>
        <div className="font-display text-3xl text-navy">Olá, {user?.name?.split(" ")[0]}</div>
        <div className="text-text2 text-sm capitalize">{fmt} · {time}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Atendimentos hoje" value={isLoading ? "..." : String(data?.appointments.length ?? 0)} />
        <StatCard label="Clientes ativas" value={isLoading ? "..." : String(data?.activeClients ?? 0)} />
        <StatCard label="Estoque crítico" value={isLoading ? "..." : String(data?.stockCritical ?? 0)} />
      </div>

      <div>
        <div className="font-display text-xl text-navy mb-3">Atalhos rápidos</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Shortcut to="/clientes" icon={<IconUserPlus size={22} />} label="Nova cliente" />
          <Shortcut to="/ficha" icon={<IconClipboardHeart size={22} />} label="Prontuário" />
          <Shortcut to="/fechar-pacote" icon={<IconPackage size={22} />} label="Fechar pacote" />
          <Shortcut to="/financeiro" icon={<IconCoin size={22} />} label="Recebimento" />
          <Shortcut to="/estoque" icon={<IconBoxSeam size={22} />} label="Estoque" />
        </div>
      </div>

      <div className="bh-card p-6">
        <div className="font-display text-lg text-navy mb-2">Agenda do dia</div>
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 w-48 rounded bg-bg2 animate-pulse" />
            <div className="h-4 w-72 rounded bg-bg2 animate-pulse" />
          </div>
        ) : !data?.appointments.length ? (
          <div className="text-text3 text-sm">Nenhum atendimento hoje.</div>
        ) : (
          <div className="divide-y divide-border">
            {data.appointments.map((a) => (
              <div key={a.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-semibold text-navy">{a.clients?.name ?? "Cliente"}</div>
                  <div className="text-text3">{a.procedures?.name ?? "Procedimento"}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-navy">{new Date(a.datetime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="text-xs text-text3 capitalize">{a.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bh-card p-5">
      <div className="text-xs uppercase tracking-wider text-text3 font-semibold">{label}</div>
      <div className="font-display text-3xl text-navy mt-1">{value}</div>
    </div>
  );
}

function Shortcut({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="bh-card p-4 flex flex-col items-center justify-center gap-2 text-center hover:border-gold hover:shadow-md transition"
    >
      <div className="text-gold">{icon}</div>
      <div className="text-sm font-semibold text-navy">{label}</div>
    </Link>
  );
}
