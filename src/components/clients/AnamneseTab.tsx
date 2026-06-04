// Aba Anamnese — 1 registro por cliente, salvo em client_anamnesis
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type A = {
  health_history: string;
  allergies: string;
  medications: string;
  contraindications: string;
};
const EMPTY: A = { health_history: "", allergies: "", medications: "", contraindications: "" };

export function AnamneseTab({ clientId }: { clientId: string }) {
  const [a, setA] = useState<A>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("client_anamnesis")
        .select("health_history,allergies,medications,contraindications")
        .eq("client_id", clientId)
        .maybeSingle();
      if (data) setA({ ...EMPTY, ...(data as A) });
      setLoading(false);
    })();
  }, [clientId]);

  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("client_anamnesis")
        .upsert({ client_id: clientId, ...a, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
      if (error) throw error;
      toast.success("Anamnese salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="bh-card p-6 text-text3 text-sm">Carregando...</div>;

  return (
    <div className="bh-card p-6 space-y-4">
      <div className="font-display text-lg text-navy">Anamnese</div>
      <Field label="Histórico de saúde" v={a.health_history} onChange={(v) => setA({ ...a, health_history: v })} />
      <Field label="Alergias" v={a.allergies} onChange={(v) => setA({ ...a, allergies: v })} />
      <Field label="Medicamentos em uso" v={a.medications} onChange={(v) => setA({ ...a, medications: v })} />
      <Field label="Contraindicações" v={a.contraindications} onChange={(v) => setA({ ...a, contraindications: v })} />
      <div className="flex justify-end">
        <button onClick={save} disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
          {busy ? "Salvando..." : "Salvar anamnese"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>
      <textarea value={v} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
    </div>
  );
}
