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
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth";
import type { Permissions } from "@/integrations/supabase/client";

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
      { to: "/escala", label: "Escala & Ponto", icon: <IconCalendar size={18} />, key: "agenda" },
      { to: "/usuarios", label: "Usuários", icon: <IconUserShield size={18} />, key: "usuarios" },
    ],
  },

];

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (!user) return null;

  return (
    <aside className="flex w-[220px] shrink-0 flex-col bg-navy text-silver h-screen sticky top-0">
      <div className="px-5 py-6 border-b border-white/10">
        <div className="font-display text-2xl text-white leading-tight">Beauty House</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {SECTIONS.map((sec, si) => {
          const visible = sec.items.filter((i) => user.permissions[i.key]);
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
                return (
                  <Link
                    key={i.to}
                    to={i.to}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors border-l-2 ${
                      active
                        ? "bg-navy2 text-white border-gold"
                        : "border-transparent hover:bg-navy2 hover:text-white"
                    }`}
                  >
                    {i.icon}
                    <span>{i.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
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
