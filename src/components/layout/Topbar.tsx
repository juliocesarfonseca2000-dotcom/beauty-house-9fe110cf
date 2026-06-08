import { useEffect, useState } from "react";
import { IconPackage, IconMenu2, IconX } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { supabase } from "@/integrations/supabase/client";

type CritProduct = { id: string; name: string; qty_current: number; qty_min: number };

export function Topbar({ title, onMenuClick }: { title?: string; onMenuClick?: () => void }) {
  const [openStock, setOpenStock] = useState(false);
  const [stock, setStock] = useState<CritProduct[]>([]);
  const [stockCount, setStockCount] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: prods } = await supabase
        .from("products").select("id,name,qty_current,qty_min,active").eq("active", true);
      const crit = ((prods ?? []) as Array<CritProduct & { active: boolean }>)
        .filter((p) => Number(p.qty_current) <= Number(p.qty_min));
      if (!active) return;
      setStock(crit);
      setStockCount(crit.length);
    })();
    return () => { active = false; };
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-card border-b border-border h-14 flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-2 min-w-0">
        {onMenuClick && (
          <button onClick={onMenuClick} className="md:hidden p-2 -ml-2 rounded-md hover:bg-bg2 text-navy" title="Menu">
            <IconMenu2 size={20} />
          </button>
        )}
        <h1 className="font-display text-lg md:text-xl text-navy truncate">{title ?? ""}</h1>
      </div>
      <div className="flex items-center gap-1 md:gap-2">
        {/* Estoque crítico */}
        <div className="relative">
          <button
            onClick={() => setOpenStock((v) => !v)}
            className="relative p-2 rounded-md hover:bg-bg2 text-gold"
            title="Estoque crítico"
          >
            <IconPackage size={18} />
            {stockCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gold text-white text-[10px] font-bold flex items-center justify-center">
                {stockCount > 9 ? "9+" : stockCount}
              </span>
            )}
          </button>
          {openStock && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpenStock(false)} />
              <div className="absolute right-0 top-full mt-1 w-80 max-h-[70vh] overflow-y-auto bh-card z-40 shadow-xl">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <div className="font-semibold text-navy text-sm">Estoque crítico</div>
                  <button onClick={() => setOpenStock(false)} className="p-1 text-text3 hover:text-navy"><IconX size={14} /></button>
                </div>
                {stock.length === 0 ? (
                  <div className="p-6 text-center text-text3 text-sm">Tudo acima do mínimo.</div>
                ) : (
                  stock.map((p) => (
                    <Link
                      key={p.id}
                      to="/estoque"
                      onClick={() => setOpenStock(false)}
                      className="block p-3 border-b border-border last:border-0 hover:bg-bg2"
                    >
                      <div className="text-sm font-semibold text-navy">{p.name}</div>
                      <div className="text-xs text-text2 mt-0.5">
                        Atual: <span className="text-danger font-semibold">{p.qty_current}</span> · Mín: {p.qty_min}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <NotificationBell />
      </div>
    </header>
  );
}
