import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

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
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg2">
        <div className="font-display text-xl text-navy">Carregando...</div>
      </div>
    );
  }
  if (!user) return null;

  let title = TITLES[path];
  if (!title) {
    const base = "/" + path.split("/")[1];
    title = TITLES[base] ?? "";
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} />
        <main className="flex-1 p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
