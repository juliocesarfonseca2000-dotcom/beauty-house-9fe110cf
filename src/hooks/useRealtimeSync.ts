import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TABLES = [
  "clients", "appointments", "sessions",
  "packages", "products", "procedures",
  "app_users", "staff_absences", "notifications", "income",
  "expenses", "time_entries", "contracts",
  "procedure_professionals", "message_campaigns",
] as const;

const DERIVED: Record<string, string[]> = {
  sessions: ["client-sessions"],
  packages: ["client-sessions", "low-packages", "dashboard"],
  clients: ["client", "clients", "clients-list", "dashboard", "sidebar-counts"],
  appointments: ["appointments", "dashboard"],
  products: ["dashboard", "stock", "sidebar-counts"],
  procedures: ["sidebar-counts"],
  staff_absences: ["absences", "agenda"],
  notifications: ["notifications", "notifications-all"],
  income: ["income", "fechamento", "dashboard"],
  expenses: ["expenses", "fechamento", "dashboard"],
  time_entries: ["ponto", "escala"],
  contracts: ["contracts"],
};

export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase.channel("app-realtime-sync");

    for (const table of TABLES) {
      (channel as unknown as { on: (...args: unknown[]) => unknown }).on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          if (debounceRef.current[table]) {
            clearTimeout(debounceRef.current[table]);
          }
          debounceRef.current[table] = setTimeout(() => {
            qc.invalidateQueries({ queryKey: [table] });
            qc.invalidateQueries({
              predicate: (q) =>
                Array.isArray(q.queryKey) && q.queryKey[0] === table,
            });
            const keys = DERIVED[table] ?? [];
            for (const k of keys) {
              qc.invalidateQueries({
                predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === k,
              });
            }
          }, 1000);
        },
      );
    }

    channel.subscribe();

    return () => {
      Object.values(debounceRef.current).forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
