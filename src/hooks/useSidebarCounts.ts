import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSidebarCounts() {
  return useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: async () => {
      const [clients, procedures, products] = await Promise.all([
        supabase.from("clients").select("*", { count: "exact", head: true }).eq("active", true),
        supabase.from("procedures").select("*", { count: "exact", head: true }).eq("active", true),
        supabase.from("products").select("*", { count: "exact", head: true }).eq("active", true),
      ]);
      return {
        clients: clients.count ?? 0,
        procedures: procedures.count ?? 0,
        products: products.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}
