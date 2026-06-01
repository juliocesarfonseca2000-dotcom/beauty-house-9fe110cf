import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/usuarios")({
  component: () => (<div className="bh-card p-12 text-center"><div className="font-display text-2xl text-navy">Usuários</div><div className="text-text3 text-sm mt-2">Em construção — próxima fase.</div></div>),
});
