import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/procedimentos")({
  component: () => (<div className="bh-card p-12 text-center"><div className="font-display text-2xl text-navy">Procedimentos</div><div className="text-text3 text-sm mt-2">Em construção — próxima fase.</div></div>),
});
