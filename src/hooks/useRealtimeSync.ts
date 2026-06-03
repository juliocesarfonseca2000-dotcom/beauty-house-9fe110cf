import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina mudanças realtime nas tabelas principais e invalida o cache
 * do React Query para que todos os usuários logados vejam atualizações
 * sem precisar recarregar a página.
 *
 * Requer que as tabelas estejam adicionadas à publication `supabase_realtime`
 * no banco (Database → Replication no painel do Supabase) e tenham
 * REPLICA IDENTITY FULL para receber UPDATE/DELETE completos.
 */
const TABLES = [
  "clients",
  "appointments",
  "sessions",
  "client_packages",
  "products",
  "financial_entries",
] as const;

export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase.channel("app-realtime-sync");

    for (const table of TABLES) {
      (channel as any).on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          // Invalida qualquer query que use esse nome como primeira chave
          qc.invalidateQueries({ queryKey: [table] });
          // Algumas telas usam chaves derivadas (ex: ["appointments", date])
          qc.invalidateQueries({
            predicate: (q) =>
              Array.isArray(q.queryKey) && q.queryKey[0] === table,
          });
        },
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
