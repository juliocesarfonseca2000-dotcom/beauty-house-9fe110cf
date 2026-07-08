import { createFileRoute } from "@tanstack/react-router";
import { IconBell } from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/lembretes")({
  component: LembretesPage,
});

function LembretesPage() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <IconBell size={24} className="text-gold" />
        <h1 className="text-2xl font-semibold text-navy">Lembretes</h1>
      </div>
      <p className="text-silver/70">Em breve.</p>
    </div>
  );
}
