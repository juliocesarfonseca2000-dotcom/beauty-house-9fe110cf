import { Link, useRouterState } from "@tanstack/react-router";
import {
  IconLayoutDashboard,
  IconCalendar,
  IconUsers,
  IconClipboardHeart,
  IconCoin,
} from "@tabler/icons-react";
import { useAuth } from "@/lib/auth";
import type { Permissions } from "@/integrations/supabase/client";

type Item = { to: string; label: string; icon: React.ReactNode; key: keyof Permissions };

const ITEMS: Item[] = [
  { to: "/", label: "Início", icon: <IconLayoutDashboard size={20} />, key: "dash" },
  { to: "/agenda", label: "Agenda", icon: <IconCalendar size={20} />, key: "agenda" },
  { to: "/clientes", label: "Clientes", icon: <IconUsers size={20} />, key: "clientes" },
  { to: "/ficha", label: "Ficha", icon: <IconClipboardHeart size={20} />, key: "ficha" },
  { to: "/financeiro", label: "Caixa", icon: <IconCoin size={20} />, key: "financeiro" },
];

export function BottomNav() {
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!user) return null;
  const visible = ITEMS.filter((i) => user.permissions[i.key]);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-navy text-silver border-t border-white/10 grid grid-cols-5 h-16 pb-[env(safe-area-inset-bottom)]">
      {visible.map((i) => {
        const active = path === i.to || (i.to !== "/" && path.startsWith(i.to));
        return (
          <Link
            key={i.to}
            to={i.to}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
              active ? "text-gold" : "text-silver/70 hover:text-white"
            }`}
          >
            {i.icon}
            <span>{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
