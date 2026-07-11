import { supabase } from "@/integrations/supabase/client";

/**
 * Busca inteligente de clientes, usada em todo o sistema.
 * - Aceita palavras em qualquer ordem: "fabiana oliveira" encontra "FABIANA GONCALVES DE OLIVEIRA".
 * - Não exige o nome completo.
 * - Também busca pelo número/código da ficha (record_num), inclusive alfanumérico como "1234M".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyClientSearch<T>(query: T, term: string): T {
  const clean = term.trim();
  if (!clean) return query;

  const words = clean.split(/\s+/).filter(Boolean);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;

  if (words.length === 1) {
    const w = words[0].replace(/[%,]/g, "");
    q = q.or(`name.ilike.%${w}%,record_num.ilike.%${w}%`);
  } else {
    for (const raw of words) {
      const w = raw.replace(/[%,]/g, "");
      q = q.ilike("name", `%${w}%`);
    }
  }
  return q as T;
}

/**
 * Versão que executa a busca e devolve as linhas.
 */
export async function searchClients(
  term: string,
  opts?: { columns?: string; activeOnly?: boolean; limit?: number }
) {
  const columns = opts?.columns ?? "id,name,record_num,phone,cpf";
  let q = supabase.from("clients").select(columns);
  q = applyClientSearch(q, term);
  if (opts?.activeOnly) q = q.eq("active", true);
  q = q.order("name").limit(opts?.limit ?? 8);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
