import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSidebarCounts() {
  return useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: async () => {
      const [clients, procedures, products] = await Promise.allSettled([
        supabase.from("clients").select("*", { count: "exact", head: true }).eq("active", true),
        supabase.from("procedures").select("*", { count: "exact", head: true }).eq("active", true),
        supabase.from("products").select("*", { count: "exact", head: true }).eq("active", true),
      ]);
      return {
        clients:    clients.status    === "fulfilled" ? (clients.value.count    ?? 0) : 0,
        procedures: procedures.status === "fulfilled" ? (procedures.value.count ?? 0) : 0,
        products:   products.status   === "fulfilled" ? (products.value.count   ?? 0) : 0,
      };
    },
    staleTime: 0,
  });
}
