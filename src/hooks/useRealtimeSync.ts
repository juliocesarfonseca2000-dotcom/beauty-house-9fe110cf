import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina mudanças realtime nas tabelas principais e invalida o cache
 * do React Query para que todos os usuários logados vejam atualizações
 * sem precisar recarregar a página.
 */
const TABLES = [
  "clients",
  "appointments",
  "sessions",
  "client_packages",
  "packages",
  "products",
  "financial_entries",
  "procedures",
  "app_users",
  "staff_absences",
  "notifications",
  "income",
  "procedure_professionals",
  "message_campaigns",
] as const;

export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase.channel("app-realtime-sync");

    for (const table of TABLES) {
      (channel as unknown as { on: (...args: unknown[]) => unknown }).on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          qc.invalidateQueries({ queryKey: [table] });
          qc.invalidateQueries({
            predicate: (q) =>
              Array.isArray(q.queryKey) && q.queryKey[0] === table,
          });
          // chaves derivadas comuns (ex: ["client-sessions", id], ["dashboard", ...])
          const derived: Record<string, string[]> = {
            sessions: ["client-sessions"],
            packages: ["client-sessions", "low-packages", "dashboard"],
            clients: ["client", "clients-list", "dashboard"],
            appointments: ["appointments", "dashboard"],
            products: ["dashboard", "stock"],
            staff_absences: ["absences", "agenda"],
            notifications: ["notifications", "notifications-all"],
          };
          const keys = derived[table] ?? [];
          for (const k of keys) {
            qc.invalidateQueries({
              predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === k,
            });
          }
        },
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
