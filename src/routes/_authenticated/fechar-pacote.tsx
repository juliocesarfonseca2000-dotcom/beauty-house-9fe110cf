import { createFileRoute } from "@tanstack/react-router";

function Stub({ title }: { title: string }) {
  return (
    <div className="bh-card p-12 text-center">
      <div className="font-display text-2xl text-navy">{title}</div>
      <div className="text-text3 text-sm mt-2">Em construção — próxima fase.</div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/fechar-pacote")({
  component: () => <Stub title="Fechar pacote" />,
});
