import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { IconX, IconDownload, IconCheck } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  generateContractPdf,
  getClinicInfo,
  getContractClauses,
  getNextContractNumber,
  peekNextContractNumber,
  type ContractItem,
  type ContractPayload,
  type ClinicInfo,
} from "@/lib/contract-pdf";

export type ContractInput = {
  clientId: string;
  packageIds?: string[];
  items: ContractItem[];
  total: number;
  paymentMethod: string;
  installments?: number | null;
};

type Client = {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  address: string | null;
  record_num: number | null;
};

type SavedContract = {
  id: string;
  client_snapshot: Record<string, unknown> | null;
  clinic_snapshot: Record<string, unknown> | null;
  items: ContractItem[];
  total: number;
  payment_method: string | null;
  installments: number | null;
  pdf_path: string | null;
  client_signature: string | null;
  pro_signature: string | null;
  pro_user_name: string | null;
  signed_at: string | null;
  created_at: string;
};

export function ContractModal({
  input,
  existingContractId,
  client: clientProp,
  onClose,
}: {
  input?: ContractInput;
  existingContractId?: string;
  client?: Client | null;
  onClose: () => void;
}) {
  const { user: me } = useAuth();
  const [client, setClient] = useState<Client | null>(clientProp ?? null);
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [clauses, setClauses] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<SavedContract | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientSigData, setClientSigData] = useState<string | null>(null);
  const [proSigData, setProSigData] = useState<string | null>(null);
  const [signingWho, setSigningWho] = useState<"client" | "pro" | null>(null);
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [contractNumManual, setContractNumManual] = useState<string>("");
  const [peekedNum, setPeekedNum] = useState<number | null>(null);

  useEffect(() => {
    if (!existingContractId) peekNextContractNumber().then(setPeekedNum);
  }, [existingContractId]);

  useEffect(() => {
    (async () => {
      const [clinicData, clausesData] = await Promise.all([getClinicInfo(), getContractClauses()]);
      setClinic(clinicData);
      setClauses(clausesData);

      if (existingContractId) {
        const { data } = await supabase.from("contracts").select("*").eq("id", existingContractId).maybeSingle();
        if (data) {
          setExisting(data as SavedContract);
          const snap = (data as SavedContract).client_snapshot as Client | null;
          if (snap) setClient(snap as Client);
        }
      } else if (input) {
        // Try to refresh from DB but fall back to clientProp/state
        const { data } = await supabase
          .from("clients").select("id,name,cpf,phone,address,record_num")
          .eq("id", input.clientId).maybeSingle();
        if (data) setClient(data as Client);
        else if (clientProp) setClient(clientProp);
      }
      setLoading(false);
    })();
  }, [existingContractId, input, clientProp]);


  const openSignatureModal = (who: "client" | "pro") => {
    setSigningWho(who);
    setTimeout(() => sigRef.current?.clear(), 50);
  };

  const confirmSignature = () => {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      toast.error("Assine antes de confirmar");
      return;
    }
    const dataUrl = sigRef.current.toDataURL("image/png");
    if (signingWho === "client") setClientSigData(dataUrl);
    else setProSigData(dataUrl);
    setSigningWho(null);
  };

  const buildPayload = (contractNum?: number | null): ContractPayload | null => {
    if (!client || !clinic) return null;
    return {
      recordNum: client.record_num,
      contractNum: contractNum ?? null,
      client: { name: client.name, cpf: client.cpf, phone: client.phone, address: client.address },
      clinic,
      items: input?.items ?? (existing?.items ?? []),
      total: input?.total ?? existing?.total ?? 0,
      payment_method: input?.paymentMethod ?? existing?.payment_method ?? "Pix",
      installments: input?.installments ?? existing?.installments ?? null,
      clauses,
      client_signature_data: clientSigData ?? existing?.client_signature ?? null,
      pro_signature_data: proSigData ?? existing?.pro_signature ?? null,
      pro_name: me?.name ?? existing?.pro_user_name ?? null,
    };
  };

  const previewPdf = async () => {
    let contractNum: number | null = null;
    if (existingContractId) {
      const { data } = await supabase
        .from("contracts")
        .select("contract_number")
        .eq("id", existingContractId)
        .maybeSingle();
      contractNum = (data as { contract_number?: number | null } | null)?.contract_number ?? null;
    } else {
      contractNum = await peekNextContractNumber();
    }
    const payload = buildPayload(contractNum);
    if (!payload) return;
    const blob = await generateContractPdf(payload);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const downloadExisting = async () => {
    if (!existing) return;
    if (existing.pdf_path) {
      const { data } = await supabase.storage.from("contracts").createSignedUrl(existing.pdf_path, 3600);
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
        return;
      }
    }
    // Regerar com número do contrato
    const { data: contractData } = await supabase
      .from("contracts")
      .select("contract_number")
      .eq("id", existingContractId ?? "")
      .maybeSingle();
    const contractNum = (contractData as { contract_number?: number | null } | null)?.contract_number ?? null;
    const payload = buildPayload(contractNum);
    if (!payload) return;
    const blob = await generateContractPdf(payload);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const finalizeAndSave = async () => {
    if (!input) return toast.error("Dados do contrato ausentes");
    if (!client) return toast.error("Cliente não carregado — feche e tente novamente");
    if (!clinic) return toast.error("Dados da clínica não carregados");
    if (!clientSigData) return toast.error("Falta assinatura da cliente");
    if (!proSigData) return toast.error("Falta assinatura do responsável");

    setBusy(true);
    try {
      const contractNum = contractNumManual.trim()
        ? Number(contractNumManual.trim())
        : await getNextContractNumber();
      const payload = buildPayload(contractNum);
      if (!payload) throw new Error("Dados incompletos");
      const blob = await generateContractPdf(payload);

      const fileName = `${client.id}/${Date.now()}.pdf`;
      let pdf_path: string | null = null;
      try {
        const up = await supabase.storage.from("contracts").upload(fileName, blob, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (up.error) {
          console.warn("Bucket contracts indisponível:", up.error.message);
          toast.warning("Bucket 'contracts' não encontrado — contrato salvo sem PDF anexado.");
        } else {
          pdf_path = up.data.path;
        }
      } catch (storageErr) {
        console.warn("Falha no upload do PDF:", storageErr);
        toast.warning("Não foi possível anexar o PDF — contrato será salvo mesmo assim.");
      }

      const { error } = await supabase.from("contracts").insert({
        client_id: client.id,
        package_ids: input.packageIds ?? null,
        clinic_snapshot: clinic,
        client_snapshot: client,
        items: input.items,
        total: input.total,
        payment_method: input.paymentMethod,
        installments: input.installments ?? null,
        pdf_path,
        client_signature: clientSigData,
        pro_signature: proSigData,
        pro_user_id: me?.id ?? null,
        pro_user_name: me?.name ?? null,
        signed_at: new Date().toISOString(),
        created_by: me?.id ?? null,
        contract_number: contractNum,
      });
      if (error) {
        console.error("Erro ao inserir contrato:", error);
        throw new Error(error.message || "Falha ao gravar contrato");
      }
      toast.success("Contrato salvo com sucesso ✓");
      onClose();
    } catch (e) {
      console.error("finalizeAndSave:", e);
      toast.error(e instanceof Error ? e.message : "Erro ao salvar contrato");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center">
      <div className="bg-card rounded-xl p-8 text-text2">Carregando…</div>
    </div>
  );

  const isReadonly = !!existing;
  const hasClientSig = !!(clientSigData || existing?.client_signature);
  const hasProSig = !!(proSigData || existing?.pro_signature);
  const items = input?.items ?? existing?.items ?? [];
  const total = input?.total ?? existing?.total ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">
            {isReadonly ? "Contrato assinado" : "Gerar contrato"}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          {client && (
            <div className="bh-card p-4 bg-bg2/50">
              <div className="text-xs uppercase text-text3 font-semibold mb-1">Cliente</div>
              <div className="font-semibold text-navy">{client.name}</div>
              <div className="text-xs text-text2">
                {client.cpf && <>CPF: {client.cpf} · </>}
                {client.phone && <>Tel: {client.phone}</>}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs uppercase text-text3 font-semibold mb-2">Itens do contrato</div>
            <table className="w-full text-sm">
              <thead className="bg-bg2 text-text2">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Procedimento</th>
                  <th className="text-center px-3 py-2 font-semibold">Sessões</th>
                  <th className="text-right px-3 py-2 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{it.procedure_name}</td>
                    <td className="px-3 py-2 text-center">{it.sessions}</td>
                    <td className="px-3 py-2 text-right">{it.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  </tr>
                ))}
                <tr className="bg-gold/10 font-semibold">
                  <td colSpan={2} className="px-3 py-2 text-right text-navy">Total</td>
                  <td className="px-3 py-2 text-right text-gold">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {!isReadonly && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-text2 uppercase mb-1.5">
                Número do contrato <span className="text-text3 font-normal normal-case">(opcional — sequencial automático se vazio)</span>
              </label>
              <input
                type="number"
                min={1}
                value={contractNumManual}
                onChange={(e) => setContractNumManual(e.target.value)}
                placeholder={peekedNum != null ? `Próximo: ${peekedNum}` : "..."}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <SignatureBox
              label="Assinatura da cliente"
              dataUrl={clientSigData ?? existing?.client_signature ?? null}
              onSign={() => openSignatureModal("client")}
              readonly={isReadonly}
            />
            <SignatureBox
              label={`Responsável: ${me?.name ?? existing?.pro_user_name ?? "—"}`}
              dataUrl={proSigData ?? existing?.pro_signature ?? null}
              onSign={() => openSignatureModal("pro")}
              readonly={isReadonly}
            />
          </div>
        </div>

        <div className="flex justify-between gap-2 px-6 py-4 border-t">
          <button type="button" onClick={previewPdf} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2 text-sm">
            Visualizar PDF
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Fechar</button>
            {isReadonly ? (
              <button type="button" onClick={downloadExisting} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 flex items-center gap-2">
                <IconDownload size={16} /> Baixar PDF
              </button>
            ) : (
              <button type="button" onClick={finalizeAndSave} disabled={busy || !hasClientSig || !hasProSig}
                className="px-5 py-2 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 disabled:opacity-50 flex items-center gap-2">
                <IconCheck size={16} /> {busy ? "Salvando..." : "Finalizar e salvar contrato"}
              </button>
            )}
          </div>
        </div>
      </div>

      {signingWho && (
        <div className="fixed inset-0 z-[60] bg-navy/80 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b font-display text-xl text-navy">
              {signingWho === "client" ? "Assinatura da cliente" : "Assinatura do responsável"}
            </div>
            <div className="p-4">
              <div className="border-2 border-dashed border-border rounded-lg bg-white">
                <SignatureCanvas
                  ref={(r) => { sigRef.current = r; }}
                  canvasProps={{ width: 500, height: 200, className: "w-full h-[200px]" }}
                  penColor="black"
                />
              </div>
            </div>
            <div className="flex justify-between px-6 py-4 border-t">
              <button type="button" onClick={() => sigRef.current?.clear()} className="px-3 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Limpar</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSigningWho(null)} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
                <button type="button" onClick={confirmSignature} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2">Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SignatureBox({ label, dataUrl, onSign, readonly }: { label: string; dataUrl: string | null; onSign: () => void; readonly: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-text3 font-semibold mb-1">{label}</div>
      <div className="border-2 border-dashed border-border rounded-lg bg-white h-32 flex items-center justify-center">
        {dataUrl ? (
          <img src={dataUrl} alt="Assinatura" className="max-h-full max-w-full" />
        ) : (
          <span className="text-text3 text-sm">Sem assinatura</span>
        )}
      </div>
      {!readonly && (
        <button type="button" onClick={onSign} className="mt-2 w-full px-3 py-1.5 rounded-lg border border-border text-text2 hover:bg-bg2 text-xs">
          {dataUrl ? "Reassinar" : "Assinar"}
        </button>
      )}
    </div>
  );
}
