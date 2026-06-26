import { useEffect, useRef, useState } from "react";
import { IconX, IconCamera, IconLoader2, IconUpload, IconTrash, IconPlus } from "@tabler/icons-react";
import { useServerFn } from "@tanstack/react-start";
import { scanClientCard, type ProcedureHistoryItem } from "@/lib/scan-card.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { withTimeout } from "@/lib/with-timeout";
import { getNextFichaNumber } from "@/lib/contract-pdf";

type Evaluator = { id: string; name: string; is_evaluator?: boolean; role?: string };
type Procedure = { id: string; name: string };

type HistoryRow = {
  procedure_id: string;
  procedure_name_raw: string;
  sessions_done: number;
  sessions_total: number;
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bestProcedureMatch(raw: string, procs: Procedure[]): string {
  if (!raw || !procs.length) return "";
  const n = normalize(raw);
  if (!n) return "";
  // exact normalized
  let exact = procs.find((p) => normalize(p.name) === n);
  if (exact) return exact.id;
  // contains in either direction
  const partial = procs.find((p) => {
    const pn = normalize(p.name);
    return pn.includes(n) || n.includes(pn);
  });
  if (partial) return partial.id;
  // first significant token
  const token = n.split(" ").find((t) => t.length >= 4);
  if (token) {
    const tokenMatch = procs.find((p) => normalize(p.name).includes(token));
    if (tokenMatch) return tokenMatch.id;
  }
  return "";
}

export function ScanClientCardModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState<"upload" | "review" | "history">("upload");
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [form, setForm] = useState({
    recordNum: "", name: "", phone: "", phone_commercial: "", evaluatorId: "", notes: "",
  });
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const scanFn = useServerFn(scanClientCard);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: evs }, { data: procs }] = await Promise.all([
        withTimeout(supabase.from("app_users").select("id,name,is_evaluator,role")
          .eq("active", true).or("is_evaluator.eq.true,role.eq.admin").order("name"), 10000, "Carregamento das avaliadoras"),
        withTimeout(supabase.from("procedures").select("id,name").eq("active", true).order("name"), 10000, "Carregamento dos procedimentos"),
      ]);
      if (!active) return;
      setEvaluators((evs as Evaluator[]) ?? []);
      setProcedures((procs as Procedure[]) ?? []);
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
      // pre-fill history
      const rows: HistoryRow[] = (result.procedures_history ?? []).map((h: ProcedureHistoryItem) => {
        const procId = bestProcedureMatch(h.procedure_name, procedures);
        const done = Math.max(0, Math.floor(h.sessions_done ?? 0));
        const total = h.sessions_total != null
          ? Math.max(done, Math.floor(h.sessions_total))
          : Math.max(done, 10);
        return {
          procedure_id: procId,
          procedure_name_raw: h.procedure_name,
          sessions_done: done,
          sessions_total: total,
        };
      });
      setHistory(rows);
      setStep("review");
      toast.success("Dados extraídos! Confira e ajuste se necessário.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler ficha");
    } finally {
      setScanning(false);
    }
  };

  const goHistory = () => {
    if (!form.name.trim() || !form.phone.trim()) return toast.error("Nome e WhatsApp obrigatórios");
    setStep("history");
  };

  const addHistoryRow = () => {
    setHistory((h) => [...h, { procedure_id: "", procedure_name_raw: "", sessions_done: 0, sessions_total: 10 }]);
  };
  const removeHistoryRow = (i: number) => setHistory((h) => h.filter((_, idx) => idx !== i));
  const updateHistoryRow = (i: number, patch: Partial<HistoryRow>) =>
    setHistory((h) => h.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const finalize = async (skipHistory: boolean) => {
    setBusy(true);
    try {
      const notes = [form.notes, form.phone_commercial ? `Tel. comercial: ${form.phone_commercial}` : ""].filter(Boolean).join("\n");

      // Verifica se o record_num já existe antes de inserir
      let recordNumToUse: number | undefined = undefined;
      if (form.recordNum.trim()) {
        const num = Number(form.recordNum);
        const { data: existing } = await supabase
          .from("clients")
          .select("id")
          .eq("record_num", num)
          .maybeSingle();
        if (!existing) {
          recordNumToUse = num;
        }
      }
      // Se o número lido já existe ou não foi lido, gera automaticamente
      if (recordNumToUse == null) {
        recordNumToUse = await getNextFichaNumber();
      }

      console.log("[SCAN] iniciando insert de cliente, evaluatorId:", form.evaluatorId);
      const { data, error } = await withTimeout(
        supabase.from("clients").insert({
          ...(recordNumToUse != null ? { record_num: recordNumToUse } : {}),
          name: form.name.trim(),
          phone: form.phone.trim(),
          evaluator_id: form.evaluatorId || null,
          notes: notes || null,
        }).select("id").single(),
        12000,
        "Cadastro da cliente"
      );
      if (error) {
        console.error("[SCAN] erro no insert clients:", error);
        throw error;
      }
      console.log("[SCAN] cliente criada:", (data as { id: string }).id);
      const clientId = (data as { id: string }).id;

      if (!skipHistory) {
        const valid = history.filter((h) => h.procedure_id && h.sessions_total > 0);
        let failedCount = 0;
        for (const row of valid) {
          const done = Math.max(0, Math.min(row.sessions_done, row.sessions_total));
          const total = row.sessions_total;
          const completed = done >= total;
          const { data: pkg, error: pkgErr } = await supabase
            .from("packages")
            .insert({
              client_id: clientId,
              procedure_id: row.procedure_id,
              sess_total: total,
              sess_done: done,
              price_full: 0,
              price_paid: 0,
              discount_pct: 0,
              pay_method: "importado",
              status: completed ? "completed" : "active",
              is_bonus: false,
              origin: "ficha_importada",
            })
            .select("id")
            .single();
          if (pkgErr) {
            console.error("Erro criando pacote importado:", pkgErr);
            continue;
          }
          const pkgId = (pkg as { id: string }).id;
          const sessRows = Array.from({ length: total }, (_, i) => {
            const num = i + 1;
            const isDone = num <= done;
            return {
              package_id: pkgId,
              client_id: clientId,
              session_num: num,
              status: isDone ? "done" : "pending",
              session_status: isDone ? "confirmed" : "pending",
              done_at: null,
              signature_data: null,
            };
          });
          const { error: sessErr } = await supabase.from("sessions").insert(sessRows);
          if (sessErr) {
            console.warn("Erro ao importar sessões:", sessErr.message);
            failedCount += 1;
            continue;
          }
        }
      }

      toast.success("Cliente cadastrada!");
      onCreated(clientId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("[SCAN SAVE ERROR]", err);
      toast.error(msg || "Erro ao salvar");
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
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>

        {step === "upload" && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UploadBox label="Frente da ficha*" file={front} onFile={setFront} inputRef={frontRef} />
              <UploadBox label="Verso (opcional)" file={back} onFile={setBack} inputRef={backRef} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
              <button
                type="button"
                onClick={doScan}
                disabled={!front || scanning}
                className="px-5 py-2 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 disabled:opacity-50 flex items-center gap-2"
              >
                {scanning ? <><IconLoader2 size={18} className="animate-spin" /> Lendo...</> : <>Ler dados com IA</>}
              </button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="p-6 space-y-4">
            <div className="text-xs text-text2 bg-gold/10 border border-gold/30 rounded-lg p-3">
              ✨ Confira os dados extraídos pela IA e corrija se necessário antes de continuar.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Número da ficha"><input type="number" value={form.recordNum} onChange={(e) => setForm({ ...form, recordNum: e.target.value })} className={inp} placeholder="Automático" /></Field>
              <Field label="Nome*"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} required /></Field>
              <Field label="WhatsApp*"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inp} required /></Field>
              <Field label="Telefone comercial"><input value={form.phone_commercial} onChange={(e) => setForm({ ...form, phone_commercial: e.target.value })} className={inp} /></Field>
              <Field label="Avaliadora">
                <select value={form.evaluatorId} onChange={(e) => setForm({ ...form, evaluatorId: e.target.value })} className={inp}>
                  <option value="">Selecionar...</option>
                  {evaluators.map((ev) => <option key={ev.id} value={ev.id}>{(ev.is_evaluator || ev.role === "admin") ? "★ " : ""}{ev.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Observações / Tratamento">
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} className={inp} />
            </Field>
            <div className="flex justify-between gap-2 pt-2">
              <button type="button" onClick={() => setStep("upload")} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Voltar</button>
              <button type="button" onClick={goHistory} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2">
                Avançar →
              </button>
            </div>
          </div>
        )}

        {step === "history" && (
          <div className="p-6 space-y-4">
            <div>
              <div className="font-display text-lg text-navy">Histórico de procedimentos</div>
              <div className="text-xs text-text2 mt-1">
                Confira os procedimentos e sessões já realizadas detectadas na ficha. Você pode ajustar, remover ou adicionar manualmente.
                <br/><span className="text-text3">Estes pacotes serão importados sem gerar lançamento financeiro.</span>
              </div>
            </div>

            {history.length === 0 && (
              <div className="text-sm text-text3 italic bg-bg2 rounded-lg p-4 text-center">
                Nenhum histórico detectado pela IA. Você pode adicionar manualmente abaixo ou pular esta etapa.
              </div>
            )}

            <div className="space-y-3">
              {history.map((row, i) => (
                <div key={i} className="bh-card p-3 space-y-2">
                  {row.procedure_name_raw && (
                    <div className="text-xs text-text3">Lido da ficha: <span className="italic">"{row.procedure_name_raw}"</span></div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                    <div className="md:col-span-6">
                      <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wide mb-1">Procedimento</label>
                      <select
                        value={row.procedure_id}
                        onChange={(e) => updateHistoryRow(i, { procedure_id: e.target.value })}
                        className={inp}
                      >
                        <option value="">— selecione —</option>
                        {procedures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wide mb-1">Já realizadas</label>
                      <input
                        type="number"
                        min={0}
                        value={row.sessions_done}
                        onChange={(e) => updateHistoryRow(i, { sessions_done: Math.max(0, Number(e.target.value) || 0) })}
                        className={inp}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-semibold text-text2 uppercase tracking-wide mb-1">Total</label>
                      <input
                        type="number"
                        min={1}
                        value={row.sessions_total}
                        onChange={(e) => updateHistoryRow(i, { sessions_total: Math.max(1, Number(e.target.value) || 1) })}
                        className={inp}
                      />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeHistoryRow(i)}
                        className="p-2 rounded-lg border border-border text-danger hover:bg-danger/10"
                        title="Remover"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addHistoryRow}
              className="w-full px-4 py-2 rounded-lg border border-dashed border-border text-text2 hover:bg-bg2 flex items-center justify-center gap-2 text-sm"
            >
              <IconPlus size={16} /> Adicionar procedimento manualmente
            </button>

            <div className="flex justify-between gap-2 pt-2 flex-wrap">
              <button
                type="button"
                onClick={() => setStep("review")}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2 disabled:opacity-50"
              >
                Voltar
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => finalize(true)}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2 disabled:opacity-50"
                >
                  Pular esta etapa
                </button>
                <button
                  type="button"
                  onClick={() => finalize(false)}
                  disabled={busy}
                  className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50"
                >
                  {busy ? "Salvando..." : "Cadastrar cliente"}
                </button>
              </div>
            </div>
          </div>
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
