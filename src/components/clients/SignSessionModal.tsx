import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { IconX } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { withTimeout } from "@/lib/with-timeout";

export type SignSessionPackage = {
  id: string;
  procedure_id: string;
  sess_total: number;
  sess_done: number;
  procedures: { name: string; requires_term: boolean | null; term_text: string | null } | null;
};

export type SignSessionData = {
  id: string;
  package_id: string;
  session_num: number;
};

type Professional = { id: string; name: string };

export function SignSessionModal({
  pkg, session, onClose, onSaved,
}: {
  clientId?: string;
  pkg: SignSessionPackage;
  session: SignSessionData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [pros, setPros] = useState<Professional[]>([]);
  const [proId, setProId] = useState("");
  const [notes, setNotes] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("app_users")
      .select("id,name")
      .eq("active", true)
      .eq("role", "professional")
      .order("name")
      .then(({ data }) => {
        if (active) setPros((data as Professional[]) ?? []);
      });
    return () => { active = false; };
  }, []);

  const clear = () => { sigRef.current?.clear(); setHasInk(false); };

  const confirm = async () => {
    if (!hasInk || sigRef.current?.isEmpty()) {
      toast.error("A cliente precisa assinar antes de confirmar.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = sigRef.current!.getCanvas().toDataURL("image/png");
      const { error } = await withTimeout(supabase.from("sessions").update({
        status: "done",
        session_status: "confirmed",
        done_at: new Date().toISOString(),
        professional_id: proId || null,
        signature_data: dataUrl,
        notes: notes || null,
      }).eq("id", session.id), 12000, "Confirmação da sessão");
      if (error) throw error;
      const { data: fresh } = await withTimeout(
        supabase.from("packages").select("sess_done").eq("id", pkg.id).single(),
        5000, "Leitura do pacote"
      );
      const newDone = (fresh?.sess_done ?? 0) + 1;
      await withTimeout(supabase.from("packages").update({ sess_done: newDone }).eq("id", pkg.id), 12000, "Atualização do pacote");
      toast.success("Sessão confirmada!");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Sessão #{session.session_num} · Confirmar presença</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-text2 text-sm">{pkg.procedures?.name} · {new Date().toLocaleString("pt-BR")}</div>
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Profissional responsável</label>
            <select value={proId} onChange={(e) => setProId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm">
              <option value="">Selecionar...</option>
              {pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Observações</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Assinatura da cliente (400×200)</label>
            <div className="border-2 border-dashed border-gold/40 rounded-lg bg-bg2 relative" style={{ minHeight: 200 }}>
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{ className: "w-full rounded-lg", style: { height: 200, touchAction: "none" } }}
                onBegin={() => setHasInk(true)}
                penColor="#12283F"
              />
              {!hasInk && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-text3 text-sm">
                  Peça para a cliente assinar aqui com o dedo
                </div>
              )}
            </div>
            <button onClick={clear} className="text-xs text-text2 hover:text-navy mt-2 underline">Limpar</button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button
              onClick={confirm}
              disabled={!hasInk || busy}
              className="px-5 py-2 rounded-lg bg-success text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Salvando..." : "Confirmar assinatura"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
