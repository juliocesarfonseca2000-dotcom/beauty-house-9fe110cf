import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { IconX } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { withTimeout } from "@/lib/with-timeout";

type Doctor = { id: string; name: string; crm: string | null; specialty: string | null; council_type: string | null };

export type SignNoteData = {
  id: string;
  date: string;
  procedures: { name: string } | null;
};

export function SignProntuarioModal({
  note, clientName, onClose, onSaved,
}: {
  note: SignNoteData;
  clientName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const docSigRef = useRef<SignatureCanvas | null>(null);
  const patSigRef = useRef<SignatureCanvas | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [docInk, setDocInk] = useState(false);
  const [patInk, setPatInk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("app_users")
      .select("id,name,crm,specialty,council_type")
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        if (active) setDoctors((data as Doctor[]) ?? []);
      });
    return () => { active = false; };
  }, []);

  const selectedDoctor = doctors.find((d) => d.id === doctorId) ?? null;

  const confirm = async () => {
    if (!doctorId) { toast.error("Selecione o médico responsável."); return; }
    if (!docInk || docSigRef.current?.isEmpty()) { toast.error("O médico precisa assinar."); return; }
    if (!patInk || patSigRef.current?.isEmpty()) { toast.error("O paciente precisa assinar."); return; }
    setBusy(true);
    try {
      const docSig = docSigRef.current!.getCanvas().toDataURL("image/png");
      const patSig = patSigRef.current!.getCanvas().toDataURL("image/png");
      const { error } = await withTimeout(
        supabase.from("session_notes").update({
          doctor_signature: docSig,
          patient_signature: patSig,
          doctor_id: doctorId,
          doctor_name: selectedDoctor?.name ?? null,
          doctor_crm: selectedDoctor?.crm ?? null,
          doctor_council_type: selectedDoctor?.council_type ?? null,
          doctor_specialty: selectedDoctor?.specialty ?? null,
          signed_at: new Date().toISOString(),
          locked: true,
        }).eq("id", note.id),
        12000, "Assinatura do prontuário"
      );
      if (error) throw error;
      toast.success("Prontuário assinado!");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao assinar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Assinar prontuário</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bh-card p-3 bg-bg2/50 text-sm space-y-1">
            <div><span className="text-text3">Paciente:</span> <b className="text-navy">{clientName}</b></div>
            <div><span className="text-text3">Procedimento:</span> <b className="text-navy">{note.procedures?.name ?? "—"}</b></div>
            <div><span className="text-text3">Data:</span> <b className="text-navy">{new Date(note.date + "T12:00:00").toLocaleDateString("pt-BR")}</b></div>
          </div>

          <div className="bh-card p-3 border border-danger/30 bg-danger/5 text-xs text-danger">
            ⚠️ Após assinar, este prontuário <b>não poderá mais ser editado ou excluído</b>.
          </div>

          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Médico responsável</label>
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm">
              <option value="">Selecionar...</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.crm ? ` — ${d.crm}` : ""}
                </option>
              ))}
            </select>
            {selectedDoctor && !selectedDoctor.crm && (
              <div className="text-xs text-danger mt-1">Este profissional não tem registro do conselho cadastrado. Preencha em Usuários.</div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Assinatura do médico</label>
            <div className="border-2 border-dashed border-gold/40 rounded-lg bg-bg2 relative" style={{ minHeight: 140 }}>
              <SignatureCanvas
                ref={docSigRef}
                canvasProps={{ className: "w-full rounded-lg", style: { height: 140, touchAction: "none" } }}
                onBegin={() => setDocInk(true)}
                penColor="#12283F"
              />
              {!docInk && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-text3 text-sm">
                  Médico assina aqui
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <button onClick={() => { docSigRef.current?.clear(); setDocInk(false); }} className="text-xs text-text2 hover:text-navy underline">Limpar</button>
              {selectedDoctor && (
                <div className="text-[11px] text-text3 text-right leading-tight">
                  <div className="font-semibold text-navy">{selectedDoctor.name}</div>
                  {selectedDoctor.crm && <div>{selectedDoctor.crm}</div>}
                  {selectedDoctor.specialty && <div>{selectedDoctor.specialty}</div>}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Assinatura do paciente</label>
            <div className="border-2 border-dashed border-gold/40 rounded-lg bg-bg2 relative" style={{ minHeight: 140 }}>
              <SignatureCanvas
                ref={patSigRef}
                canvasProps={{ className: "w-full rounded-lg", style: { height: 140, touchAction: "none" } }}
                onBegin={() => setPatInk(true)}
                penColor="#12283F"
              />
              {!patInk && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-text3 text-sm">
                  Paciente assina aqui
                </div>
              )}
            </div>
            <button onClick={() => { patSigRef.current?.clear(); setPatInk(false); }} className="text-xs text-text2 hover:text-navy underline mt-1.5">Limpar</button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button
              onClick={confirm}
              disabled={!doctorId || !docInk || !patInk || busy}
              className="px-5 py-2 rounded-lg bg-success text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Assinando..." : "Assinar e bloquear"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
