import { IconBell, IconAlertTriangle, IconPackage } from "@tabler/icons-react";

export function Topbar({ title }: { title?: string }) {
  return (
    <header className="sticky top-0 z-20 bg-card border-b border-border h-14 flex items-center justify-between px-6">
      <h1 className="font-display text-xl text-navy">{title ?? ""}</h1>
      <div className="flex items-center gap-2">
        <button className="p-2 rounded-md hover:bg-bg2 text-danger" title="Estoque crítico">
          <IconAlertTriangle size={18} />
        </button>
        <button className="p-2 rounded-md hover:bg-bg2 text-gold" title="Pacotes acabando">
          <IconPackage size={18} />
        </button>
        <button className="p-2 rounded-md hover:bg-bg2 text-text2" title="Notificações">
          <IconBell size={18} />
        </button>
      </div>
    </header>
  );
}
