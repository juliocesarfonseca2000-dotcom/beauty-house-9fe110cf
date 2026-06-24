import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  IconLayoutDashboard,
  IconCalendar,
  IconUsers,
  IconClipboardHeart,
  IconPackage,
  IconStethoscope,
  IconBoxSeam,
  IconCoin,
  IconChartBar,
  IconUserShield,
  IconKey,
  IconLogout,
  IconClock,
  IconMessageDots,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth";
import type { Permissions } from "@/integrations/supabase/client";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";

type Item = { to: string; label: string; icon: React.ReactNode; key: keyof Permissions };
type Section = { label: string | null; items: Item[] };

const SECTIONS: Section[] = [
  {
    label: null,
    items: [
      { to: "/", label: "Dashboard", icon: <IconLayoutDashboard size={18} />, key: "dash" },
      { to: "/agenda", label: "Agenda", icon: <IconCalendar size={18} />, key: "agenda" },
    ],
  },
  {
    label: "Principal",
    items: [
      { to: "/clientes", label: "Clientes", icon: <IconUsers size={18} />, key: "clientes" },
    ],
  },
  {
    label: "Atendimento",
    items: [
      { to: "/ficha", label: "Ficha & Sessões", icon: <IconClipboardHeart size={18} />, key: "ficha" },
      { to: "/fechar-pacote", label: "Fechar Pacote", icon: <IconPackage size={18} />, key: "fechar" },
      { to: "/procedimentos", label: "Procedimentos", icon: <IconStethoscope size={18} />, key: "procedimentos" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { to: "/financeiro", label: "Financeiro", icon: <IconCoin size={18} />, key: "financeiro" },
      { to: "/estoque", label: "Estoque", icon: <IconBoxSeam size={18} />, key: "estoque" },
      { to: "/relatorios", label: "Relatórios", icon: <IconChartBar size={18} />, key: "relatorios" },
      { to: "/escala", label: "Escala & Ponto", icon: <IconCalendar size={18} />, key: "escala" },
      { to: "/meu-ponto", label: "Meu Ponto", icon: <IconClock size={18} />, key: "meu_ponto" },
      { to: "/usuarios", label: "Usuários", icon: <IconUserShield size={18} />, key: "usuarios" },
    ],
  },

];

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (!user) return null;

  const { data: counts } = useSidebarCounts();

  const countMap: Record<string, number | undefined> = {
    clientes: counts?.clients,
    procedimentos: counts?.procedures,
    estoque: counts?.products,
  };

  return (
    <aside className="flex w-[220px] shrink-0 flex-col bg-navy text-silver h-screen sticky top-0">
      <div className="px-5 py-6 border-b border-white/10">
        <Link to="/" onClick={onNavigate} className="font-display text-2xl text-white leading-tight block hover:text-gold transition-colors">
          Beauty House
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">

        {SECTIONS.map((sec, si) => {
          const visible = sec.items.filter((i) => {
            if (i.key === "procedimentos" && user.role === "receptionist") return true;
            // clientes e ficha são visíveis para todos os usuários autenticados
            if (i.key === "clientes" || i.key === "ficha") return true;
            if (!user.permissions[i.key]) return false;
            return true;
          });
          if (visible.length === 0) return null;

          return (
            <div key={si} className={si > 0 ? "mt-4" : ""}>
              {sec.label && (
                <div className="px-5 pb-1.5 text-[10px] uppercase tracking-widest text-silver/50 font-semibold">
                  {sec.label}
                </div>
              )}
              {visible.map((i) => {
                const active = path === i.to || (i.to !== "/" && path.startsWith(i.to));
                const count = countMap[i.key];
                const to = i.to;
                return (
                  <Link
                    key={i.to}
                    to={to}
                    onClick={onNavigate}
                    className={`flex items-center justify-between gap-3 px-5 py-2.5 text-sm transition-colors border-l-2 ${
                      active
                        ? "bg-navy2 text-white border-gold"
                        : "border-transparent hover:bg-navy2 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {i.icon}
                      <span>{i.label}</span>
                    </span>
                    {typeof count === "number" && count > 0 && (
                      <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-700 shrink-0">
                        {count.toLocaleString("pt-BR")}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
        {(user.role === "admin" || user.role === "receptionist") && (
          <div className="mt-4">
            <div className="px-5 pb-1.5 text-[10px] uppercase tracking-widest text-silver/50 font-semibold">Marketing</div>
            <Link
              to="/mensagens"
              onClick={onNavigate}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors border-l-2 ${
                path.startsWith("/mensagens")
                  ? "bg-navy2 text-white border-gold"
                  : "border-transparent hover:bg-navy2 hover:text-white"
              }`}
            >
              <IconMessageDots size={18} />
              <span>Mensagens</span>
            </Link>
          </div>
        )}
      </nav>

      <div className="px-5 py-4 border-t border-white/10 text-xs">
        <div className="text-white font-semibold truncate">{user.name}</div>
        <div className="text-silver/70 truncate">{user.email}</div>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => { onNavigate?.(); navigate({ to: "/trocar-senha" }); }}
            className="p-2 rounded-md hover:bg-navy2 text-silver hover:text-gold"
            title="Trocar senha"
          >
            <IconKey size={16} />
          </button>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
            className="p-2 rounded-md hover:bg-navy2 text-silver hover:text-danger"
            title="Sair"
          >
            <IconLogout size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
