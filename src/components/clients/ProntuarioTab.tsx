// Aba Prontuário — sessão a sessão. Cada registro salvo em session_notes.
import { useEffect, useState } from "react";
import { IconPlus, IconTrash, IconEdit, IconCheck, IconX, IconWriting, IconLock, IconDownload } from "@tabler/icons-react";
import { generateProntuarioPdf } from "@/lib/prontuario-pdf";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { SignProntuarioModal } from "./SignProntuarioModal";

type Proc = { id: string; name: string };
type Note = {
  id: string;
  date: string;
  procedure_id: string | null;
  equipment: string | null;
  parameters: string | null;
  notes: string | null;
  created_by: string | null;
  procedures: { name: string } | null;
  doctor_signature: string | null;
  patient_signature: string | null;
  doctor_name: string | null;
  doctor_crm: string | null;
  doctor_specialty: string | null;
  signed_at: string | null;
  locked: boolean | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export function ProntuarioTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "receptionist" || user?.is_evaluator === true;
  const canDeleteSigned = user?.role === "admin" || user?.role === "receptionist";
  const [notes, setNotes] = useState<Note[]>([]);
  const [procs, setProcs] = useState<Proc[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState<Note | null>(null);

  const load = async () => {
    setLoading(true);
    const [n, p] = await Promise.all([
      supabase.from("session_notes").select("id,date,procedure_id,equipment,parameters,notes,created_by,doctor_signature,patient_signature,doctor_name,doctor_crm,doctor_specialty,signed_at,locked,procedures(name)")
        .eq("client_id", clientId).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("packages").select("procedure_id,procedures(id,name)").eq("client_id", clientId),
    ]);
    setNotes(((n.data as unknown as Note[]) ?? []));
    const seen = new Set<string>();
    const procList: Proc[] = [];
    for (const row of ((p.data as unknown as Array<{ procedure_id: string | null; procedures: { id: string; name: string } | null }>) ?? [])) {
      const pr = row.procedures;
      if (pr && !seen.has(pr.id)) { seen.add(pr.id); procList.push({ id: pr.id, name: pr.name }); }
    }
    procList.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    setProcs(procList);
    setLoading(false);
  };


  useEffect(() => { load(); }, [clientId]);

  const onSaved = () => { setEditing(null); setCreating(false); load(); };

  const downloadPdf = async (n: Note) => {
    try {
      // busca dados extras da cliente para o cabeçalho do PDF
      const { data: cli } = await supabase
        .from("clients")
        .select("cpf,record_num")
        .eq("id", clientId)
        .maybeSingle();
      const blob = await generateProntuarioPdf({
        clientName,
        clientCpf: (cli as { cpf?: string | null } | null)?.cpf ?? null,
        clientRecordNum: (cli as { record_num?: number | null } | null)?.record_num ?? null,
        procName: n.procedures?.name ?? "Procedimento",
        date: n.date,
        equipment: n.equipment,
        parameters: n.parameters,
        notes: n.notes,
        doctorSignature: n.doctor_signature,
        patientSignature: n.patient_signature,
        doctorName: n.doctor_name,
        doctorCrm: n.doctor_crm,
        doctorSpecialty: n.doctor_specialty,
        signedAt: n.signed_at,
      });
      // download direto via blob (não depende de URL externa)
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prontuario_${clientName.replace(/\s+/g, "_")}_${n.date}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    }
  };

  const remove = async (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (note?.locked) {
      if (!canDeleteSigned) {
        toast.error("Prontuário assinado só pode ser excluído por admin ou recepção.");
        return;
      }
      if (!confirm("ATENÇÃO: este prontuário está ASSINADO e tem valor legal.\n\nA exclusão é permanente. Deseja mesmo continuar?")) return;
      const senha = window.prompt("Digite a senha mestra para confirmar a exclusão do prontuário assinado:");
      if (!senha) return;
      const { data } = await supabase.from("settings").select("admin_password").limit(1).maybeSingle();
      const expected = (data as { admin_password: string } | null)?.admin_password;
      if (!expected || senha !== expected) { toast.error("Senha incorreta. Exclusão cancelada."); return; }
    } else {
      if (!confirm("Excluir este registro?")) return;
    }
    const { error } = await supabase.from("session_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Registro excluído");
    load();
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <button onClick={() => setCreating(true)} className="px-4 py-2 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center gap-2">
            <IconPlus size={16} /> Adicionar registro
          </button>
        </div>
      )}

      {canEdit && creating && (
        <NoteForm
          clientId={clientId}
          procs={procs}
          userId={user?.id ?? null}
          initial={null}
          onCancel={() => setCreating(false)}
          onSaved={onSaved}
        />
      )}

      {loading ? (
        <div className="bh-card p-6 text-text3 text-sm">Carregando...</div>
      ) : notes.length === 0 && !creating ? (
        <div className="bh-card p-10 text-center text-text3 text-sm">Nenhum registro de prontuário ainda.</div>
      ) : (
        notes.map((n) => (
          canEdit && !n.locked && editing?.id === n.id ? (
            <NoteForm
              key={n.id}
              clientId={clientId}
              procs={procs}
              userId={user?.id ?? null}
              initial={n}
              editingId={n.id}
              onCancel={() => setEditing(null)}
              onSaved={onSaved}
            />
          ) : (
            <div key={n.id} className="bh-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-text3">{new Date(n.date).toLocaleDateString("pt-BR")}</div>
                  <div className="font-display text-lg text-navy">{n.procedures?.name ?? "Procedimento"}</div>
                </div>
                {n.locked ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs text-success font-semibold">
                      <IconLock size={14} /> Assinado
                    </div>
                    <button onClick={() => downloadPdf(n)} className="px-2 py-1.5 rounded-md bg-gold text-white text-xs font-semibold flex items-center gap-1 hover:bg-gold2" title="Baixar PDF do prontuário">
                      <IconDownload size={14} /> PDF
                    </button>
                    {canDeleteSigned && (
                      <button onClick={() => remove(n.id)} className="p-1.5 rounded-md hover:bg-danger/10 text-danger" title="Excluir prontuário assinado (exige senha mestra)">
                        <IconTrash size={14} />
                      </button>
                    )}
                  </div>
                ) : canEdit && (
                  <div className="flex gap-1">
                    <button onClick={() => setSigning(n)} className="px-2 py-1.5 rounded-md bg-navy text-white text-xs font-semibold flex items-center gap-1 hover:bg-navy/90" title="Assinar prontuário">
                      <IconWriting size={14} /> Assinar
                    </button>
                    <button onClick={() => setEditing(n)} className="p-1.5 rounded-md hover:bg-bg2 text-navy"><IconEdit size={14} /></button>
                    <button onClick={() => remove(n.id)} className="p-1.5 rounded-md hover:bg-danger/10 text-danger"><IconTrash size={14} /></button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
                {n.equipment && <div><span className="text-text3 text-xs uppercase">Aparelho:</span> <span className="text-text2">{n.equipment}</span></div>}
                {n.parameters && <div><span className="text-text3 text-xs uppercase">Parâmetros:</span> <span className="text-text2">{n.parameters}</span></div>}
              </div>
              {n.notes && <div className="mt-2 text-sm text-text2 whitespace-pre-wrap">{n.notes}</div>}
              {n.locked && n.signed_at && (
                <div className="mt-4 pt-3 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-text3 mb-1">Assinatura do médico</div>
                    {n.doctor_signature && <img src={n.doctor_signature} alt="Assinatura do médico" className="h-16 object-contain" />}
                    <div className="mt-1 inline-block border border-navy/30 rounded px-2 py-1 text-[10px] leading-tight text-navy">
                      <div className="font-semibold">{n.doctor_name}</div>
                      {n.doctor_crm && <div>{n.doctor_crm}</div>}
                      {n.doctor_specialty && <div>{n.doctor_specialty}</div>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-text3 mb-1">Assinatura do paciente</div>
                    {n.patient_signature && <img src={n.patient_signature} alt="Assinatura do paciente" className="h-16 object-contain" />}
                    <div className="text-[10px] text-text3 mt-1">
                      Assinado em {new Date(n.signed_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        ))
      )}

      {signing && (
        <SignProntuarioModal
          note={{ id: signing.id, date: signing.date, procedures: signing.procedures }}
          clientName={clientName}
          onClose={() => setSigning(null)}
          onSaved={() => { setSigning(null); load(); }}
        />
      )}
    </div>
  );
}

function NoteForm({ clientId, procs, userId, initial, editingId, onCancel, onSaved }: {
  clientId: string; procs: Proc[]; userId: string | null;
  initial: Note | null; editingId?: string; onCancel: () => void; onSaved: () => void;
}) {
  const [date, setDate] = useState(initial?.date ?? todayStr());
  const [procId, setProcId] = useState(initial?.procedure_id ?? "");
  const [equipment, setEquipment] = useState(initial?.equipment ?? "");
  const [parameters, setParameters] = useState(initial?.parameters ?? "");
  const [notes, setNotes] = useState(editingId ? (initial?.notes ?? "") : "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        client_id: clientId,
        date,
        procedure_id: procId || null,
        equipment: equipment || null,
        parameters: parameters || null,
        notes: notes || null,
        created_by: userId,
      };
      const { error } = editingId
        ? await supabase.from("session_notes").update(payload).eq("id", editingId)
        : await supabase.from("session_notes").insert(payload);
      if (error) throw error;
      toast.success(editingId ? "Atualizado" : "Adicionado");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bh-card p-5 space-y-3 border-2 border-gold/40">
      <div className="flex items-center justify-between">
        <div className="font-display text-lg text-navy">{editingId ? "Editar registro" : "Novo registro"}</div>
        <button onClick={onCancel} className="p-1 text-text3 hover:text-navy"><IconX size={16} /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Data"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} /></Field>
        <Field label="Procedimento">
          <select value={procId} onChange={(e) => setProcId(e.target.value)} className={inp} disabled={procs.length === 0}>
            <option value="">{procs.length === 0 ? "Nenhum procedimento comprado por esta cliente" : "— selecione —"}</option>
            {procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <Field label="Aparelho"><input value={equipment} onChange={(e) => setEquipment(e.target.value)} className={inp} placeholder="Ex: Endermologie" /></Field>
        <Field label="Parâmetros"><input value={parameters} onChange={(e) => setParameters(e.target.value)} className={inp} placeholder="Ex: Potência 8, 2 passadas" /></Field>
      </div>
      <Field label="Observações">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inp} />
      </Field>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
        <button onClick={save} disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50 flex items-center gap-2">
          <IconCheck size={16} /> {busy ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-gold/40";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>{children}</div>;
}
