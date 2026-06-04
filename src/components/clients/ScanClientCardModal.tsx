import { useEffect, useRef, useState } from "react";
import { IconX, IconCamera, IconLoader2, IconUpload } from "@tabler/icons-react";
import { useServerFn } from "@tanstack/react-start";
import { scanClientCard } from "@/lib/scan-card.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { withTimeout } from "@/lib/with-timeout";

type Evaluator = { id: string; name: string; is_evaluator?: boolean };

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function ScanClientCardModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [form, setForm] = useState({
    recordNum: "", name: "", phone: "", phone_commercial: "", evaluatorId: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const scanFn = useServerFn(scanClientCard);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await withTimeout(supabase.from("app_users").select("id,name,is_evaluator")
        .eq("active", true).or("role.eq.admin,is_evaluator.eq.true").order("name"), 10000, "Carregamento das avaliadoras");
      if (active) setEvaluators((data as Evaluator[]) ?? []);
    })();
    return () => { active = false; };
  }, []);

  const doScan = async () => {
    if (!front) return toast.error("Adicione a foto da frente da ficha");
    setScanning(true);
    try {
      const frontB64 = await fileToBase64(front);
      const backB64 = back ? await fileToBase64(back) : undefined;
      const result = await scanFn({
        data: {
          frontBase64: frontB64,
          frontMime: front.type || "image/jpeg",
          backBase64: backB64,
          backMime: back?.type,
        },
      });
      // Try to match evaluator by name
      const match = result.evaluator_name
        ? evaluators.find((e) => e.name.toLowerCase().includes(result.evaluator_name!.toLowerCase().split(" ")[0]))
        : null;
      setForm({
        recordNum: result.record_num?.replace(/\D/g, "") ?? "",
        name: result.name ?? "",
        phone: (result.phone ?? "").replace(/\D/g, ""),
        phone_commercial: (result.phone_commercial ?? "").replace(/\D/g, ""),
        evaluatorId: match?.id ?? "",
        notes: result.notes ?? "",
      });
      setStep("review");
      toast.success("Dados extraídos! Confira e ajuste se necessário.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler ficha");
    } finally {
      setScanning(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return toast.error("Nome e WhatsApp obrigatórios");
    setBusy(true);
    try {
      const notes = [form.notes, form.phone_commercial ? `Tel. comercial: ${form.phone_commercial}` : ""].filter(Boolean).join("\n");
      const { data, error } = await withTimeout(supabase.from("clients").insert({
        ...(form.recordNum.trim() ? { record_num: Number(form.recordNum) } : {}),
        name: form.name.trim(),
        phone: form.phone.trim(),
        evaluator_id: form.evaluatorId || null,
        notes: notes || null,
      }).select("id").single(), 12000, "Cadastro da cliente");
      if (error) throw error;
      toast.success("Cliente cadastrada!");
      onCreated((data as { id: string }).id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy flex items-center gap-2">
            <IconCamera size={22} /> Escanear ficha
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>

        {step === "upload" ? (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UploadBox label="Frente da ficha*" file={front} onFile={setFront} inputRef={frontRef} />
              <UploadBox label="Verso (opcional)" file={back} onFile={setBack} inputRef={backRef} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
              <button
                onClick={doScan}
                disabled={!front || scanning}
                className="px-5 py-2 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 disabled:opacity-50 flex items-center gap-2"
              >
                {scanning ? <><IconLoader2 size={18} className="animate-spin" /> Lendo...</> : <>Ler dados com IA</>}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={save} className="p-6 space-y-4">
            <div className="text-xs text-text2 bg-gold/10 border border-gold/30 rounded-lg p-3">
              ✨ Confira os dados extraídos pela IA e corrija se necessário antes de salvar.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Número da ficha"><input type="number" value={form.recordNum} onChange={(e) => setForm({ ...form, recordNum: e.target.value })} className={inp} placeholder="Automático" /></Field>
              <Field label="Nome*"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} required /></Field>
              <Field label="WhatsApp*"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} required /></Field>
              <Field label="Telefone comercial"><input value={form.phone_commercial} onChange={(e) => setForm({ ...form, phone_commercial: e.target.value })} className={inp} /></Field>
              <Field label="Avaliadora">
                <select value={form.evaluatorId} onChange={(e) => setForm({ ...form, evaluatorId: e.target.value })} className={inp}>
                  <option value="">Selecionar...</option>
                  {evaluators.map((ev) => <option key={ev.id} value={ev.id}>{ev.is_evaluator ? "★ " : ""}{ev.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Observações / Tratamento">
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className={inp} />
            </Field>
            <div className="flex justify-between gap-2 pt-2">
              <button type="button" onClick={() => setStep("upload")} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Voltar</button>
              <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
                {busy ? "Salvando..." : "Cadastrar cliente"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function UploadBox({ label, file, onFile, inputRef }: { label: string; file: File | null; onFile: (f: File | null) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const url = file ? URL.createObjectURL(file) : null;
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full aspect-[4/3] rounded-lg border-2 border-dashed border-border hover:border-gold bg-bg2 flex flex-col items-center justify-center gap-2 text-text2 overflow-hidden"
      >
        {url ? (
          <img src={url} alt="" className="w-full h-full object-contain" />
        ) : (
          <>
            <IconUpload size={28} className="text-text3" />
            <div className="text-xs">Clique para enviar foto</div>
          </>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {file && (
        <button type="button" onClick={() => onFile(null)} className="mt-1 text-xs text-danger hover:underline">Remover</button>
      )}
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-gold/40 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>{children}</div>;
}
