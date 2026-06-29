import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { BottomNav } from "@/components/layout/BottomNav";
import { ReportProblemFAB } from "@/components/support/ReportProblemFAB";
import { IconX } from "@tabler/icons-react";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/agenda": "Agenda",
  "/clientes": "Clientes",
  "/ficha": "Ficha & Sessões",
  "/fechar-pacote": "Fechar Pacote",
  "/procedimentos": "Procedimentos",
  "/estoque": "Estoque",
  "/financeiro": "Financeiro",
  "/relatorios": "Relatórios",
  "/usuarios": "Usuários",
  "/trocar-senha": "Trocar senha",
};

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading, authReady } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isKiosk = (user as { is_kiosk?: boolean } | null)?.is_kiosk === true;

  useEffect(() => {
    if (!loading && authReady && !user) navigate({ to: "/login", replace: true });
  }, [loading, authReady, user, navigate]);

  useEffect(() => {
    if (!loading && authReady && user && isKiosk && path !== "/kiosk-ponto") {
      navigate({ to: "/kiosk-ponto", replace: true });
    }
  }, [loading, authReady, user, isKiosk, path, navigate]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [path]);

  useRealtimeSync(!!user);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg2">
        <div className="font-display text-xl text-navy">Carregando...</div>
      </div>
    );
  }
  if (!user) return null;

  // Overlay cobre qualquer flash enquanto a navegação do kiosk não completa
  if (isKiosk && path !== "/kiosk-ponto") {
    return <div className="fixed inset-0 bg-navy z-[9999]" />;
  }
  if (isKiosk) {
    return <Outlet />;
  }

  let title = TITLES[path];
  if (!title) {
    const base = "/" + path.split("/")[1];
    title = TITLES[base] ?? "";
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop sidebar */}
      <div className="hidden sm:block">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative z-10">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-[-44px] p-2 rounded-md bg-card text-navy shadow-md"
              aria-label="Fechar menu"
            >
              <IconX size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 pb-20 sm:pb-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      <BottomNav />
      <ReportProblemFAB />
    </div>
  );
}
