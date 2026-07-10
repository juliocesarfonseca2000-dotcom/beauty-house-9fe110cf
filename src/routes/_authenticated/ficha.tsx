import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { ClientRecordContent } from "@/routes/_authenticated/clientes.$id";

export const Route = createFileRoute("/_authenticated/ficha")({
  validateSearch: (search: Record<string, unknown>) => ({
    cliente: typeof search.cliente === "string" ? search.cliente : undefined,
  }),
  component: FichaSearchPage,
});

function FichaSearchPage() {
  const searchParams = Route.useSearch();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; phone: string | null; record_num: number }>>([]);
  const nav = useNavigate();

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("clients")
        .select("id,name,phone,record_num")
        .eq("active", true)
        .or(`name.ilike.%${q}%,record_num.ilike.%${q}%`)
        .limit(8);
      setResults((data as never) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (searchParams.cliente) {
    return <ClientRecordContent id={searchParams.cliente} backTo="/ficha" />;
  }

  return (
    <div className="max-w-xl mx-auto mt-10 space-y-4">
      <div className="text-center">
        <div className="font-display text-3xl text-navy">Buscar ficha</div>
        <div className="text-text2 text-sm mt-1">Digite nome ou número da ficha</div>
      </div>
      <div className="relative">
        <IconSearch size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar..."
          className="w-full pl-10 pr-3 py-3 rounded-xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
      </div>
      {results.length > 0 && (
        <div className="bh-card overflow-hidden">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => nav({ to: "/ficha", search: { cliente: r.id } })}
              className="w-full text-left px-4 py-3 hover:bg-bg2 border-b border-border last:border-0 flex items-center justify-between"
            >
              <div>
                <div className="font-semibold text-navy">{r.name}</div>
                <div className="text-text3 text-xs">{r.phone ?? "sem telefone"}</div>
              </div>
              <div className="text-text3 text-xs font-mono">#{r.record_num}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
