import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { IconUserPlus, IconClipboardHeart, IconPackage, IconCoin, IconBoxSeam } from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const now = new Date();
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
        <StatCard label="Atendimentos hoje" value="—" />
        <StatCard label="Clientes ativas" value="—" />
        <StatCard label="Estoque crítico" value="—" />
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
        <div className="text-text3 text-sm">Nenhum atendimento hoje.</div>
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
