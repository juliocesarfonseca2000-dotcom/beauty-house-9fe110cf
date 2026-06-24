// Aba Anamnese + Medidas Corporais
import { useEffect, useState } from "react";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type A = {
  chronic_diseases: string;
  allergies: string;
  medications: string;
  recent_surgeries: string;
  pregnant_nursing: boolean;
  pacemaker_metal: boolean;
  coagulation_issue: boolean;
  rare_conditions: string;
  aesthetic_history: string;
};
const EMPTY_A: A = {
  chronic_diseases: "",
  allergies: "",
  medications: "",
  recent_surgeries: "",
  pregnant_nursing: false,
  pacemaker_metal: false,
  coagulation_issue: false,
  rare_conditions: "",
  aesthetic_history: "",
};

type M = {
  weight_kg: string;
  waist_cm: string;
  hip_cm: string;
  abdomen_cm: string;
  arm_cm: string;
  thigh_cm: string;
};
const EMPTY_M: M = { weight_kg: "", waist_cm: "", hip_cm: "", abdomen_cm: "", arm_cm: "", thigh_cm: "" };

export function AnamneseTab({ clientId }: { clientId: string }) {
  const { user: me } = useAuth();
  const canEdit = me?.role === "admin" || me?.role === "receptionist" || me?.is_evaluator === true;
  const [a, setA] = useState<A>(EMPTY_A);
  const [m, setM] = useState<M>(EMPTY_M);
  const [loading, setLoading] = useState(true);
  const [busyA, setBusyA] = useState(false);
  const [busyM, setBusyM] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: an }, { data: me }] = await Promise.all([
        supabase.from("client_anamnesis").select("*").eq("client_id", clientId).maybeSingle(),
        supabase.from("client_measurements").select("*").eq("client_id", clientId).maybeSingle(),
      ]);
      if (an) {
        setA({
          chronic_diseases: an.chronic_diseases ?? "",
          allergies: an.allergies ?? "",
          medications: an.medications ?? "",
          recent_surgeries: an.recent_surgeries ?? "",
          pregnant_nursing: !!an.pregnant_nursing,
          pacemaker_metal: !!an.pacemaker_metal,
          coagulation_issue: !!an.coagulation_issue,
          rare_conditions: an.rare_conditions ?? "",
          aesthetic_history: an.aesthetic_history ?? "",
        });
      }
      if (me) {
        setM({
          weight_kg: me.weight_kg?.toString() ?? "",
          waist_cm: me.waist_cm?.toString() ?? "",
          hip_cm: me.hip_cm?.toString() ?? "",
          abdomen_cm: me.abdomen_cm?.toString() ?? "",
          arm_cm: me.arm_cm?.toString() ?? "",
          thigh_cm: me.thigh_cm?.toString() ?? "",
        });
      }
      setLoading(false);
    })();
  }, [clientId]);

  const saveAnamnese = async () => {
    setBusyA(true);
    try {
      const { error } = await supabase
        .from("client_anamnesis")
        .upsert(
          { client_id: clientId, ...a, updated_at: new Date().toISOString() },
          { onConflict: "client_id" }
        );
      if (error) throw error;
      toast.success("Anamnese salva");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusyA(false);
    }
  };

  const saveMeasurements = async () => {
    setBusyM(true);
    try {
      const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
      const payload = {
        client_id: clientId,
        weight_kg: num(m.weight_kg),
        waist_cm: num(m.waist_cm),
        hip_cm: num(m.hip_cm),
        abdomen_cm: num(m.abdomen_cm),
        arm_cm: num(m.arm_cm),
        thigh_cm: num(m.thigh_cm),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("client_measurements")
        .upsert(payload, { onConflict: "client_id" });
      if (error) throw error;
      toast.success("Medidas salvas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusyM(false);
    }
  };

  if (loading) return <div className="bh-card p-6 text-text3 text-sm">Carregando...</div>;

  return (
    <div className="space-y-5">
      {/* === ANAMNESE === */}
      <div className="bh-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-text2 uppercase tracking-widest">Anamnese</div>
          {canEdit && (
            <button
              onClick={saveAnamnese}
              disabled={busyA}
              className="px-3 py-1.5 rounded-lg border border-border text-text2 hover:bg-bg2 text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              <IconDeviceFloppy size={14} /> {busyA ? "Salvando..." : "Salvar"}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Doenças crônicas" placeholder="Diabetes, hipertensão..." v={a.chronic_diseases} onChange={(v) => setA({ ...a, chronic_diseases: v })} readOnly={!canEdit} />
          <Input label="Alergias" placeholder="Medicamentos, cosméticos..." v={a.allergies} onChange={(v) => setA({ ...a, allergies: v })} readOnly={!canEdit} />
          <Input label="Medicamentos em uso" placeholder="Nome e dosagem" v={a.medications} onChange={(v) => setA({ ...a, medications: v })} readOnly={!canEdit} />
          <Input label="Cirurgias recentes" placeholder="Tipo e data" v={a.recent_surgeries} onChange={(v) => setA({ ...a, recent_surgeries: v })} readOnly={!canEdit} />
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
          <Check label="Gestante / Amamentando" v={a.pregnant_nursing} onChange={(v) => setA({ ...a, pregnant_nursing: v })} disabled={!canEdit} />
          <Check label="Marca-passo / Implante metálico" v={a.pacemaker_metal} onChange={(v) => setA({ ...a, pacemaker_metal: v })} disabled={!canEdit} />
          <Check label="Problema de coagulação" v={a.coagulation_issue} onChange={(v) => setA({ ...a, coagulation_issue: v })} disabled={!canEdit} />
        </div>

        <Textarea label="Condições raras / observações médicas" placeholder="Condições especiais, doenças raras..." rows={2} v={a.rare_conditions} onChange={(v) => setA({ ...a, rare_conditions: v })} readOnly={!canEdit} />
        <Textarea label="Histórico estético (outras clínicas)" placeholder="Botox, preenchimento, outros procedimentos anteriores..." rows={2} v={a.aesthetic_history} onChange={(v) => setA({ ...a, aesthetic_history: v })} readOnly={!canEdit} />
      </div>

      {/* === MEDIDAS === */}
      <div className="bh-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-text2 uppercase tracking-widest">Medidas Corporais</div>
          {canEdit && (
            <button
              onClick={saveMeasurements}
              disabled={busyM}
              className="px-3 py-1.5 rounded-lg border border-border text-text2 hover:bg-bg2 text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              <IconDeviceFloppy size={14} /> {busyM ? "Salvando..." : "Salvar"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Peso (kg)" placeholder="Ex: 60" v={m.weight_kg} onChange={(v) => setM({ ...m, weight_kg: v })} readOnly={!canEdit} />
          <Input label="Cintura (cm)" placeholder="Ex: 72" v={m.waist_cm} onChange={(v) => setM({ ...m, waist_cm: v })} readOnly={!canEdit} />
          <Input label="Quadril (cm)" placeholder="Ex: 96" v={m.hip_cm} onChange={(v) => setM({ ...m, hip_cm: v })} readOnly={!canEdit} />
          <Input label="Abdômen (cm)" placeholder="Ex: 84" v={m.abdomen_cm} onChange={(v) => setM({ ...m, abdomen_cm: v })} readOnly={!canEdit} />
          <Input label="Braço (cm)" placeholder="Ex: 30" v={m.arm_cm} onChange={(v) => setM({ ...m, arm_cm: v })} readOnly={!canEdit} />
          <Input label="Coxa (cm)" placeholder="Ex: 58" v={m.thigh_cm} onChange={(v) => setM({ ...m, thigh_cm: v })} readOnly={!canEdit} />
        </div>
      </div>
    </div>
  );
}

function Input({ label, placeholder, v, onChange, readOnly }: { label: string; placeholder?: string; v: string; onChange: (v: string) => void; readOnly?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-text2 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        value={v}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-card disabled:bg-bg2 disabled:text-text3"
      />
    </div>
  );
}

function Textarea({ label, placeholder, rows = 3, v, onChange, readOnly }: { label: string; placeholder?: string; rows?: number; v: string; onChange: (v: string) => void; readOnly?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-text2 uppercase tracking-wider mb-1.5">{label}</label>
      <textarea
        value={v}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-card resize-y disabled:bg-bg2 disabled:text-text3"
      />
    </div>
  );
}

function Check({ label, v, onChange, disabled }: { label: string; v: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-text2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={v}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded border-border text-gold focus:ring-gold disabled:opacity-50"
      />
      {label}
    </label>
  );
}
