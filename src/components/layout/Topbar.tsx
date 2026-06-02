import { IconBell, IconAlertTriangle, IconPackage, IconMenu2 } from "@tabler/icons-react";

export function Topbar({ title, onMenuClick }: { title?: string; onMenuClick?: () => void }) {
  return (
    <header className="sticky top-0 z-20 bg-card border-b border-border h-14 flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-2 min-w-0">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 -ml-2 rounded-md hover:bg-bg2 text-navy"
            title="Menu"
          >
            <IconMenu2 size={20} />
          </button>
        )}
        <h1 className="font-display text-lg md:text-xl text-navy truncate">{title ?? ""}</h1>
      </div>
      <div className="flex items-center gap-1 md:gap-2">
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
