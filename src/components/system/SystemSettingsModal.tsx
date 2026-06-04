// Configurações do sistema (engrenagem do módulo Usuários).
// Hoje suporta: bônus de indicação.
import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Proc = { id: string; name: string };
export type BonusConfig = { procedure_id: string | null; procedure_name: string | null; sessions_count: number };

const DEFAULT: BonusConfig = { procedure_id: null, procedure_name: null, sessions_count: 5 };

export async function getBonusConfig(): Promise<BonusConfig> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", "bonus_config").maybeSingle();
  if (!data?.value) return DEFAULT;
  return { ...DEFAULT, ...(data.value as BonusConfig) };
}

export function SystemSettingsModal({ onClose }: { onClose: () => void }) {
  const [procs, setProcs] = useState<Proc[]>([]);
  const [procId, setProcId] = useState("");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [pRes, cfg] = await Promise.all([
        supabase.from("procedures").select("id,name").eq("active", true).order("name"),
        getBonusConfig(),
      ]);
      setProcs((pRes.data as Proc[]) ?? []);
      setProcId(cfg.procedure_id ?? "");
      setCount(cfg.sessions_count ?? 5);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const proc = procs.find((p) => p.id === procId) ?? null;
      const value: BonusConfig = {
        procedure_id: proc?.id ?? null,
        procedure_name: proc?.name ?? null,
        sessions_count: Number(count) || 5,
      };
      const { error } = await supabase.from("system_settings")
        .upsert({ key: "bonus_config", value, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast.success("Configurações salvas");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Configurações do sistema</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <div className="font-display text-lg text-navy mb-1">Bônus de indicação</div>
            <div className="text-xs text-text3 mb-3">Define qual pacote é gerado automaticamente quando uma cliente é indicada.</div>
            {loading ? (
              <div className="text-text3 text-sm">Carregando...</div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Procedimento do bônus</label>
                  <select value={procId} onChange={(e) => setProcId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm">
                    <option value="">— selecione —</option>
                    {procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Quantidade de sessões</label>
                  <input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm" />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
          <button onClick={save} disabled={busy || loading} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
            {busy ? "Salvando..." : "Salvar configurações"}
          </button>
        </div>
      </div>
    </div>
  );
}
