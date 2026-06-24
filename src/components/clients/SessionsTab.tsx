import { jsPDF } from "jspdf";
import { generateTermPdf } from "@/lib/term-pdf";
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconX, IconLock, IconCheck, IconUserOff, IconCalendarOff, IconGift, IconFileText, IconCamera, IconUpload } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { withTimeout } from "@/lib/with-timeout";
import { ContractModal } from "@/components/contracts/ContractModal";

// Cria notificação no sino quando pacote tem ≤2 sessões restantes. Evita duplicar
// procurando notificações não lidas cujo action_url já referencie o package_id.
async function notifyLowPackage(opts: {
  packageId: string;
  clientId: string;
  clientName: string;
  procedureName: string;
  remaining: number;
}) {
  if (opts.remaining > 2 || opts.remaining <= 0) return;
  const tag = `pkg=${opts.packageId}`;
  const actionUrl = `/clientes/${opts.clientId}?${tag}`;
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("type", "package_low")
    .eq("is_read", false)
    .ilike("action_url", `%${tag}%`)
    .limit(1);
  if (existing && existing.length > 0) return;
  await supabase.from("notifications").insert({
    type: "package_low",
    target_roles: ["admin", "receptionist"],
    title: "Pacote vencendo",
    body: `⚠️ ${opts.clientName} — pacote de ${opts.procedureName} com apenas ${opts.remaining} sessão(ões) restante(s)`,
    action_url: actionUrl,
  });
}



type Package = {
  id: string;
  procedure_id: string;
  sess_total: number;
  sess_done: number;
  is_bonus: boolean | null;
  bonus_validated: boolean | null;
  bonus_validated_at: string | null;
  procedures: { name: string; requires_term: boolean | null; term_text: string | null } | null;
};
type Session = {
  id: string;
  package_id: string;
  session_num: number;
  status: "pending" | "done" | "missed";
  session_status: string | null;
  done_at: string | null;
  signature_url: string | null;
  signature_data: string | null;
  notes: string | null;
  appointment_id: string | null;
  signed_term_id: string | null;
};
type Professional = { id: string; name: string };

export function SessionsTab({ clientId }: { clientId: string }) {
  const { user: me } = useAuth();
  const canEdit = me?.role === "admin" || me?.role === "receptionist" || me?.is_evaluator === true;
  const [choosing, setChoosing] = useState<{ pkg: Package; session: Session } | null>(null);
  const [termAsking, setTermAsking] = useState<{ pkg: Package; session: Session } | null>(null);
  const [signingTerm, setSigningTerm] = useState<{ pkg: Package; session: Session } | null>(null);
  const [signing, setSigning] = useState<{ pkg: Package; session: Session } | null>(null);
  const [missing, setMissing] = useState<{ pkg: Package; session: Session } | null>(null);
  const [viewSig, setViewSig] = useState<{ pkg: Package; session: Session } | null>(null);
  const [attachingSig, setAttachingSig] = useState<{ pkg: Package; session: Session } | null>(null);
  const [validatingBonus, setValidatingBonus] = useState<Package | null>(null);
  const [viewContract, setViewContract] = useState<string | null>(null);
  const [viewSignedTerm, setViewSignedTerm] = useState<string | null>(null);
  const [contractsByPkg, setContractsByPkg] = useState<Record<string, string>>({});
  const [addingExisting, setAddingExisting] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const { data = { packages: [], sessions: [] }, isLoading, refetch } = useQuery({
    queryKey: ["client-sessions", clientId],
    queryFn: async () => {
      const { data: pkgs, error: pkgError } = await withTimeout(supabase
        .from("packages")
        .select("*,procedures(name,requires_term,term_text)")
        .eq("client_id", clientId)
        .eq("status", "active")
        .order("created_at"), 10000, "Carregamento dos pacotes");
      if (pkgError) throw pkgError;
      const list = ((pkgs as unknown as Package[]) ?? []).map((p) => ({
        ...p,
        is_bonus: p.is_bonus ?? false,
        bonus_validated: p.bonus_validated ?? false,
        bonus_validated_at: p.bonus_validated_at ?? null,
      }));
      if (!list.length) return { packages: list, sessions: [] };
      const ids = list.map((p) => p.id);
      const { data: sess, error: sessError } = await withTimeout(supabase
          .from("sessions")
          .select("id,package_id,session_num,status,session_status,done_at,signature_url,signature_data,notes,appointment_id,signed_term_id")
          .in("package_id", ids)
          .order("session_num"), 10000, "Carregamento das sessões");
      if (sessError) throw sessError;
      return { packages: list, sessions: (sess as Session[]) ?? [] };
    },
  });
  const { packages, sessions } = data;
  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ["client-sessions", clientId] });
    refetch();
  };

  // Ao carregar pacotes, gera notificação para os que estão com ≤2 sessões restantes
  useEffect(() => {
    if (!packages.length) return;
    (async () => {
      const { data: cli } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
      const clientName = (cli as { name?: string } | null)?.name ?? "Cliente";
      for (const pkg of packages) {
        if ((pkg.sess_total ?? 0) <= 1) continue; // avulso: nunca gera "Pacote vencendo"
        const pkgSess = sessions.filter((s) => s.package_id === pkg.id);
        const done = pkgSess.filter((s) => s.status === "done").length;
        const remaining = pkgSess.length - done;
        if (remaining > 0 && remaining <= 2) {
          await notifyLowPackage({
            packageId: pkg.id,
            clientId,
            clientName,
            procedureName: pkg.procedures?.name ?? "Procedimento",
            remaining,
          });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages.length, sessions.length]);

  // Mapeia pacote → contrato (se houver) para exibir botão "Ver contrato"
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("contracts").select("id,package_ids")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      const map: Record<string, string> = {};
      for (const c of (data ?? []) as Array<{ id: string; package_ids: string[] | null }>) {
        for (const pid of c.package_ids ?? []) {
          if (!map[pid]) map[pid] = c.id;
        }
      }
      setContractsByPkg(map);
    })();
  }, [clientId, packages.length]);

  // Carrega attendance_status dos appointments ligados às sessões pendentes
  useEffect(() => {
    const apptIds = Array.from(new Set(sessions.map((s) => s.appointment_id).filter((x): x is string => !!x)));
    if (!apptIds.length) { setAttendanceMap({}); return; }
    supabase.from("appointments").select("id,attendance_status").in("id", apptIds).then(({ data }) => {
      const m: Record<string, string> = {};
      ((data as Array<{ id: string; attendance_status: string | null }> | null) ?? []).forEach((a) => {
        if (a.attendance_status) m[a.id] = a.attendance_status;
      });
      setAttendanceMap(m);
    });
  }, [sessions]);

  const cancelSale = async (pkg: Package) => {
    if (!window.confirm(`Cancelar a venda de ${pkg.procedures?.name ?? "este pacote"}? Esta ação remove o pacote, todas as sessões, o lançamento financeiro e o contrato vinculado (se houver).`)) return;
    try {
      // 1) Contratos vinculados (package_ids contém pkg.id) — remover arquivo do storage e registro
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id,pdf_path,package_ids")
        .contains("package_ids", [pkg.id]);
      for (const c of (contracts ?? []) as Array<{ id: string; pdf_path: string | null; package_ids: string[] | null }>) {
        if (c.pdf_path) {
          await supabase.storage.from("contracts").remove([c.pdf_path]);
        }
        await supabase.from("contracts").delete().eq("id", c.id);
      }
      // 2) Income, sessões, pacote
      const incomeRes = await supabase.from("income").delete().eq("package_id", pkg.id);
      if (incomeRes.error) throw new Error(`Erro ao remover receita: ${incomeRes.error.message}`);
      const sessRes = await supabase.from("sessions").delete().eq("package_id", pkg.id);
      if (sessRes.error) throw new Error(`Erro ao remover sessões: ${sessRes.error.message}`);
      const pkgRes = await supabase.from("packages").delete().eq("id", pkg.id);
      if (pkgRes.error) throw new Error(`Erro ao remover pacote: ${pkgRes.error.message}`);
      toast.success("Venda cancelada");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar venda");
    }
  };

  if (isLoading) return <TableSkeleton rows={4} cols={6} />;

  const headerAddButton = (
    <button
      type="button"
      onClick={() => setAddingExisting(true)}
      className="px-3 py-1.5 rounded-lg border border-gold text-gold text-xs font-semibold hover:bg-gold hover:text-white"
    >
      + Adicionar procedimento já feito
    </button>
  );

  if (packages.length === 0)
    return (
      <>
        <div className="bh-card p-12 text-center space-y-3">
          <div className="font-display text-xl text-navy mb-1">Nenhum pacote ativo</div>
          <div className="text-text3 text-sm">Use "Fechar pacote" para começar — ou registre fichas físicas já existentes.</div>
          <div className="flex justify-center pt-2">{headerAddButton}</div>
        </div>
        {addingExisting && (
          <AddExistingPackageModal clientId={clientId} onClose={() => setAddingExisting(false)} onSaved={() => { setAddingExisting(false); reload(); }} />
        )}
      </>
    );

  return (
    <div className="space-y-5">
      <div className="flex justify-end">{headerAddButton}</div>
      {packages.map((pkg) => {
        const pkgSess = sessions.filter((s) => s.package_id === pkg.id).sort((a, b) => a.session_num - b.session_num);
        const firstTermId = pkgSess.find((s) => s.signed_term_id)?.signed_term_id ?? null;
        const done = pkgSess.filter((s) => s.status === "done").length;
        const remaining = pkgSess.length - done;
        const nextIdx = pkgSess.findIndex((s) => s.status === "pending");
        const lowAlert = remaining <= 2 && remaining > 0;
        const isBonus = !!pkg.is_bonus;
        const validated = !!pkg.bonus_validated;
        return (
          <div key={pkg.id} className="bh-card p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-display text-lg text-navy flex items-center gap-2 flex-wrap">
                  {pkg.procedures?.name}
                  {isBonus && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 inline-flex items-center gap-1">
                      <IconGift size={10} /> Brinde
                    </span>
                  )}
                  {isBonus && !validated && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gold/20 text-gold">
                      Bônus pendente
                    </span>
                  )}
                  {isBonus && validated && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/15 text-success">
                      ✓ Bônus validado
                    </span>
                  )}
                </div>
                <div className="text-text2 text-sm">{done} de {pkgSess.length} realizadas</div>
                {lowAlert && (
                  <div className="text-xs text-danger font-semibold mt-1">⚠️ {remaining} sessão(ões) restante(s)</div>
                )}
              </div>
              {isBonus && !validated && (
                <button
                  onClick={() => setValidatingBonus(pkg)}
                  className="px-3 py-1.5 rounded-lg bg-gold text-white text-xs font-semibold hover:bg-gold2"
                >
                  ✓ Validar bônus
                </button>
              )}
              {contractsByPkg[pkg.id] && (
                <button
                  type="button"
                  onClick={() => setViewContract(contractsByPkg[pkg.id])}
                  className="px-3 py-1.5 rounded-lg border border-border text-text2 text-xs font-semibold hover:bg-bg2 flex items-center gap-1"
                  title="Ver contrato assinado"
                >
                  <IconFileText size={14} /> Ver contrato
                </button>
              )}
              {firstTermId && (
                <button
                  type="button"
                  onClick={() => setViewSignedTerm(firstTermId)}
                  className="px-3 py-1.5 rounded-lg border border-border text-text2 text-xs font-semibold hover:bg-bg2 flex items-center gap-1"
                  title="Ver termo de consentimento assinado"
                >
                  <IconFileText size={14} /> Ver termo
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => cancelSale(pkg)}
                  className="px-3 py-1.5 rounded-lg border border-danger/40 text-danger text-xs font-semibold hover:bg-danger/10"
                  title="Cancelar venda — remove pacote, sessões e lançamento"
                >
                  Cancelar venda
                </button>
              )}
            </div>
            <div className="w-full h-2 bg-bg2 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-gold transition-all" style={{ width: `${(done / Math.max(pkgSess.length, 1)) * 100}%` }} />
            </div>
            <div className="flex flex-wrap gap-2">
              {pkgSess.map((s, i) => {
                const isNext = i === nextIdx;
                const isMissedJ = s.session_status === "missed_justified";
                const isImported = s.status === "done" && !s.signature_data && !s.signature_url;
                const cls =
                  s.status === "done"
                    ? isImported
                      ? "bg-success/70 text-white cursor-pointer hover:bg-success"
                      : "bg-success text-white"
                    : isMissedJ
                    ? "bg-text3 text-white"
                    : s.status === "missed"
                    ? "bg-danger text-white"
                    : isNext
                    ? "bg-gold text-white cursor-pointer hover:bg-gold2"
                    : "bg-bg2 text-text3";
                return (
                  <div key={s.id} className="relative">
                    <button
                      type="button"
                      disabled={!isNext && s.status === "pending"}
                      onClick={() => {
                        if (s.status === "done") {
                          if (isImported) {
                            setAttachingSig({ pkg, session: s });
                          } else {
                            setViewSig({ pkg, session: s });
                          }
                        } else if (isNext) {
                          if (s.appointment_id) {
                            const st = attendanceMap[s.appointment_id];
                            if (st === "no_show") {
                              toast.error("Cliente marcado como FALTA na agenda — não é possível assinar a sessão.");
                              return;
                            }
                            if (st !== "confirmed") {
                              toast.error("⏳ A presença precisa ser confirmada na Agenda antes de finalizar a sessão. Peça à recepção para confirmar a presença da cliente.");
                              return;
                            }
                          }
                          setChoosing({ pkg, session: s });
                        }
                      }}
                      className={`relative w-11 h-11 rounded-md text-sm font-semibold ${cls} transition`}
                      title={
                        s.status === "done"
                          ? isImported
                            ? "Sessão importada — clique para anexar assinatura"
                            : "Realizada — clique para ver"
                          : isMissedJ ? "Falta justificada — reposição agendada"
                          : s.status === "missed" ? "Sessão perdida — sem reposição"
                          : isNext ? "Próxima sessão" : "Aguardando"
                      }
                    >
                      {s.session_num}
                      {s.status === "done" && !isImported && (
                        <IconLock size={9} className="absolute -top-1 -right-1 bg-gold text-white rounded-full p-px" />
                      )}
                      {s.status === "done" && isImported && (
                        <IconCamera size={10} className="absolute -top-1 -right-1 bg-gold text-white rounded-full p-0.5" />
                      )}
                      {(s.status === "missed" || isMissedJ) && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-lg">✗</span>
                      )}
                    </button>
                    {s.signed_term_id && (
                      <button
                        type="button"
                        onClick={() => setViewSignedTerm(s.signed_term_id)}
                        title="Ver termo assinado"
                        className="absolute -bottom-1.5 -left-1 z-10 text-[8px] bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center leading-none"
                      >
                        📋
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {choosing && (
        <ChoiceModal
          session={choosing.session}
          onClose={() => setChoosing(null)}
          onConfirm={() => {
            const c = choosing;
            setChoosing(null);
            if (c.pkg.procedures?.requires_term) {
              setTermAsking(c);
            } else {
              setSigning(c);
            }
          }}
          onMiss={() => { const c = choosing; setChoosing(null); setMissing(c); }}
        />
      )}
      {termAsking && (
        <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="font-display text-xl text-navy mb-2">Termo de Consentimento</div>
            <div className="text-sm text-text2 mb-5">
              A cliente já assinou o termo de consentimento para <strong className="text-navy">{termAsking.pkg.procedures?.name}</strong>?
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={async () => {
                  const c = termAsking;
                  setTermAsking(null);
                  // Busca o signed_term_id de qualquer sessão anterior do mesmo pacote
                  const { data: prevSess } = await supabase
                    .from("sessions")
                    .select("signed_term_id")
                    .eq("package_id", c.pkg.id)
                    .not("signed_term_id", "is", null)
                    .limit(1)
                    .maybeSingle();
                  if (prevSess?.signed_term_id) {
                    // Vincula o mesmo termo à sessão atual
                    await supabase
                      .from("sessions")
                      .update({ signed_term_id: prevSess.signed_term_id })
                      .eq("id", c.session.id);
                  }
                  setSigning(c);
                }}
                className="w-full px-3 py-2 rounded-md bg-success text-white text-sm font-bold hover:bg-success/90"
              >
                ✅ Sim, já assinou
              </button>
              <button
                type="button"
                onClick={() => { const c = termAsking; setTermAsking(null); setSigningTerm(c); }}
                className="w-full px-3 py-2 rounded-md bg-gold/15 text-navy border border-gold text-sm font-bold hover:bg-gold/25"
              >
                📋 Não, assinar agora
              </button>
              <button
                type="button"
                onClick={() => setTermAsking(null)}
                className="w-full px-3 py-2 rounded-md text-text2 text-xs hover:bg-bg2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {signingTerm && (
        <TermSignModal
          clientId={clientId}
          pkg={signingTerm.pkg}
          session={signingTerm.session}
          onClose={() => setSigningTerm(null)}
          onRefresh={() => { queryClient.invalidateQueries({ queryKey: ["client-sessions", clientId] }); refetch(); }}
          onSigned={() => { const c = signingTerm; setSigningTerm(null); reload(); if (c) setSigning(c); }}
        />
      )}

      {signing && (
        <SignSessionModal
          clientId={clientId}
          pkg={signing.pkg}
          session={signing.session}
          onClose={() => setSigning(null)}
          onSaved={() => { setSigning(null); reload(); }}
        />
      )}
      {missing && (
        <MissModal
          pkg={missing.pkg}
          session={missing.session}
          clientId={clientId}
          onClose={() => setMissing(null)}
          onSaved={() => { setMissing(null); reload(); }}
        />
      )}
      {validatingBonus && (
        <ValidateBonusModal
          pkg={validatingBonus}
          onClose={() => setValidatingBonus(null)}
          onSaved={() => { setValidatingBonus(null); reload(); }}
        />
      )}
      {viewSig && (
        <SignatureViewerModal clientId={clientId} pkg={viewSig.pkg} session={viewSig.session} onClose={() => setViewSig(null)} />
      )}
      {viewContract && (
        <ContractModal existingContractId={viewContract} onClose={() => setViewContract(null)} />
      )}
      {viewSignedTerm && (
        <SignedTermViewModal signedTermId={viewSignedTerm} onClose={() => setViewSignedTerm(null)} />
      )}
      {attachingSig && (
        <AttachSignatureModal
          session={attachingSig.session}
          onClose={() => setAttachingSig(null)}
          onSaved={() => { setAttachingSig(null); reload(); }}
        />
      )}
      {addingExisting && (
        <AddExistingPackageModal clientId={clientId} onClose={() => setAddingExisting(false)} onSaved={() => { setAddingExisting(false); reload(); }} />
      )}
    </div>
  );
}

function TermSignModal({ clientId, pkg, session, onClose, onRefresh, onSigned }: {
  clientId: string; pkg: Package; session: Session; onClose: () => void; onRefresh: () => void; onSigned: () => void;
}) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const termText = pkg.procedures?.term_text ?? "Termo de consentimento.";

  const save = async () => {
    if (!hasInk || sigRef.current?.isEmpty()) { toast.error("Assinatura obrigatória"); return; }
    setBusy(true);
    try {
      const dataUrl = sigRef.current!.getCanvas().toDataURL("image/png");
      const signedAt = new Date().toISOString();
      const { data: inserted, error } = await supabase.from("signed_terms").insert({
        package_id: pkg.id,
        client_id: clientId,
        procedure_id: pkg.procedure_id,
        session_id: session.id,
        term_text: termText,
        signature_data: dataUrl,
        signed_at: signedAt,
      }).select("id").single();
      if (error) throw error;
      const termId = (inserted as { id: string }).id;
      // Vincula o termo à sessão para o botão "Ver termo" aparecer
      await supabase.from("sessions").update({ signed_term_id: termId }).eq("id", session.id);
      onRefresh();
      toast.success("Termo assinado");
      // Arquiva PDF no storage (não bloqueia o fluxo se falhar)
      try {
        const { data: cli } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
        const clientName = (cli as { name?: string } | null)?.name ?? "Cliente";
        const blob = await generateTermPdf({ clientName, procName: pkg.procedures?.name ?? "Procedimento", termText, signatureDataUrl: dataUrl, signedAt });
        const path = `${clientId}/${termId}.pdf`;
        const { error: upErr } = await supabase.storage.from("signed-terms").upload(path, blob, { contentType: "application/pdf", upsert: true });
        // Salva o PATH (não a URL) — signed URL é gerada na hora de abrir, pois não expira
        if (!upErr) {
          await supabase.from("signed_terms").update({ pdf_url: path }).eq("id", termId);
        }
      } catch (pdfErr) {
        console.warn("[term-pdf] upload falhou:", pdfErr);
      }
      onSigned();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar termo");
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Termo de consentimento — {pkg.procedures?.name} — Sessão {session.session_num}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="bh-card p-4 bg-bg2 text-sm text-navy whitespace-pre-wrap max-h-60 overflow-y-auto">{termText}</div>
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Assinatura da cliente</label>
            <div className="border-2 border-dashed border-gold/40 rounded-lg bg-bg2 relative" style={{ minHeight: 180 }}>
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{ className: "w-full rounded-lg", style: { height: 180, touchAction: "none" } }}
                onBegin={() => setHasInk(true)}
                penColor="#12283F"
              />
            </div>
            <button type="button" onClick={() => { sigRef.current?.clear(); setHasInk(false); }} className="text-xs text-text2 hover:text-navy mt-2 underline">Limpar</button>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button type="button" onClick={save} disabled={!hasInk || busy} className="px-5 py-2 rounded-lg bg-success text-white font-semibold disabled:opacity-50">
              {busy ? "Salvando..." : "Aceito e continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddExistingPackageModal({ clientId, onClose, onSaved }: {
  clientId: string; onClose: () => void; onSaved: () => void;
}) {
  const [procs, setProcs] = useState<Array<{ id: string; name: string }>>([]);
  const [procId, setProcId] = useState("");
  const [total, setTotal] = useState(10);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("procedures").select("id,name").eq("active", true).order("name")
      .then(({ data }) => setProcs((data as Array<{ id: string; name: string }>) ?? []));
  }, []);

  const save = async () => {
    if (!procId) return toast.error("Selecione um procedimento");
    if (total <= 0) return toast.error("Total de sessões inválido");
    if (done < 0 || done > total) return toast.error("Sessões realizadas inválidas");
    setBusy(true);
    try {
      const { data: pkg, error } = await supabase.from("packages").insert({
        client_id: clientId,
        procedure_id: procId,
        sess_total: total,
        sess_done: done,
        price_full: 0,
        price_paid: 0,
        discount_pct: 0,
        pay_method: "importado",
        status: "active",
        origin: "ficha_importada",
      }).select("id").single();
      if (error) throw error;
      const pkgId = (pkg as { id: string }).id;
      const rows = Array.from({ length: total }, (_, i) => ({
        package_id: pkgId,
        client_id: clientId,
        session_num: i + 1,
        status: i < done ? "done" : "pending",
        session_status: i < done ? "confirmed" : "pending",
        done_at: i < done ? new Date().toISOString() : null,
      }));
      const { error: sErr } = await supabase.from("sessions").insert(rows);
      if (sErr) throw sErr;
      toast.success("Procedimento adicionado");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-xl text-navy">Adicionar procedimento já existente</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-xs text-text3">Sem cobrança no financeiro — apenas registra o histórico.</div>
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase mb-1.5">Procedimento</label>
            <select value={procId} onChange={(e) => setProcId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm">
              <option value="">Selecionar...</option>
              {procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text2 uppercase mb-1.5">Total de sessões</label>
              <input type="number" min={1} value={total} onChange={(e) => setTotal(Number(e.target.value) || 1)} className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text2 uppercase mb-1.5">Já realizadas</label>
              <input type="number" min={0} max={total} value={done} onChange={(e) => setDone(Number(e.target.value) || 0)} className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button type="button" onClick={save} disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold disabled:opacity-50">
              {busy ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttachSignatureModal({ session, onClose, onSaved }: {
  session: Session; onClose: () => void; onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const preview = file ? URL.createObjectURL(file) : null;

  const save = async () => {
    if (!file) { toast.error("Selecione uma imagem da assinatura."); return; }
    setBusy(true);
    try {
      // Lê o arquivo como dataURL (base64) — mesmo formato usado pela assinatura digital existente.
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      // Tenta também subir para o bucket "signatures" (se existir) — se falhar, usa apenas o dataURL.
      let publicUrl: string | null = null;
      try {
        const path = `imported/${session.id}-${Date.now()}.${(file.name.split(".").pop() || "jpg").toLowerCase()}`;
        const { error: upErr } = await supabase.storage.from("signatures").upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: true,
        });
        if (!upErr) {
          const { data: sigData } = await supabase.storage.from("signatures").createSignedUrl(path, 3600);
          publicUrl = sigData?.signedUrl ?? null;
        }
      } catch {
        // bucket pode não existir — ignoramos e seguimos com dataURL
      }
      const { error } = await withTimeout(
        supabase.from("sessions").update({
          signature_data: dataUrl,
          signature_url: publicUrl,
        }).eq("id", session.id),
        12000,
        "Anexar assinatura",
      );
      if (error) throw error;
      toast.success("Assinatura anexada");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao anexar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Anexar assinatura — Sessão #{session.session_num}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          <div className="text-sm text-text2">
            Esta sessão foi importada de uma ficha de papel. Tire foto da assinatura na ficha ou envie um arquivo.
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full aspect-[4/2] rounded-lg border-2 border-dashed border-border hover:border-gold bg-bg2 flex flex-col items-center justify-center gap-2 text-text2 overflow-hidden"
          >
            {preview ? (
              <img src={preview} alt="" className="w-full h-full object-contain" />
            ) : (
              <>
                <IconUpload size={28} className="text-text3" />
                <div className="text-xs">Tirar foto ou escolher arquivo</div>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <button type="button" onClick={() => setFile(null)} className="text-xs text-danger hover:underline">Remover</button>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button
              type="button"
              onClick={save}
              disabled={!file || busy}
              className="px-5 py-2 rounded-lg bg-success text-white font-semibold disabled:opacity-50"
            >
              {busy ? "Salvando..." : "Salvar assinatura"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChoiceModal({ session, onClose, onConfirm, onMiss }: {
  session: Session; onClose: () => void; onConfirm: () => void; onMiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Sessão #{session.session_num}</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-2">
          <div className="text-sm text-text2 mb-3">O que você quer fazer com esta sessão?</div>
          <button onClick={onConfirm} className="w-full px-4 py-3 rounded-lg bg-success text-white font-semibold flex items-center gap-2 hover:bg-success/90">
            <IconCheck size={18} /> Confirmar presença
          </button>
          <button onClick={onMiss} className="w-full px-4 py-3 rounded-lg border-2 border-danger text-danger font-semibold flex items-center gap-2 hover:bg-danger/10">
            <IconUserOff size={18} /> Registrar falta
          </button>
          <button onClick={onClose} className="w-full px-4 py-3 rounded-lg border border-border text-text2 font-semibold flex items-center gap-2 hover:bg-bg2">
            <IconCalendarOff size={18} /> Reagendar (não fazer nada)
          </button>
        </div>
      </div>
    </div>
  );
}

function MissModal({ pkg, session, clientId, onClose, onSaved }: {
  pkg: Package; session: Session; clientId: string; onClose: () => void; onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"choose" | "justified" | "unjustified">("choose");
  const [reason, setReason] = useState("");

  const saveJustified = async () => {
    if (!reason.trim()) { toast.error("Informe o motivo da justificativa"); return; }
    setBusy(true);
    try {
      await withTimeout(supabase.from("sessions").update({
        status: "missed",
        session_status: "missed_justified",
        miss_reason: reason.trim(),
        done_at: new Date().toISOString(),
      }).eq("id", session.id), 12000, "Registro da falta");
      // Justificada gera +1 slot extra para reposição
      const newNum = pkg.sess_total + 1;
      await withTimeout(supabase.from("sessions").insert({
        package_id: pkg.id, client_id: clientId, session_num: newNum, status: "pending", session_status: "pending",
      }), 12000, "Novo slot");
      await withTimeout(supabase.from("packages").update({ sess_total: newNum }).eq("id", pkg.id), 12000, "Atualização do pacote");
      toast.success("Falta justificada — reposição agendada");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const saveUnjustified = async () => {
    setBusy(true);
    try {
      await withTimeout(supabase.from("sessions").update({
        status: "missed",
        session_status: "missed_unjustified",
        done_at: new Date().toISOString(),
      }).eq("id", session.id), 12000, "Registro da falta");
      toast.success("Sessão perdida registrada");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">A falta foi justificada?</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          {mode === "choose" && (
            <>
              <div className="text-sm text-text2">
                <span className="text-success font-semibold">Justificada</span>: gera +1 sessão extra (reposição garantida).<br />
                <span className="text-danger font-semibold">Não justificada</span>: a cliente perde a sessão sem direito a reposição.
              </div>
              <button onClick={() => setMode("justified")} disabled={busy} className="w-full px-4 py-3 rounded-lg bg-success text-white font-semibold hover:bg-success/90 disabled:opacity-50">
                ✓ Justificada (com motivo)
              </button>
              <button onClick={() => setMode("unjustified")} disabled={busy} className="w-full px-4 py-3 rounded-lg border-2 border-danger text-danger font-semibold hover:bg-danger/10 disabled:opacity-50">
                ✗ Não justificada
              </button>
            </>
          )}
          {mode === "justified" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Motivo da justificativa*</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Ex: atestado médico, evento familiar..." className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
              </div>
              <div className="text-xs text-text3">Reposição: será adicionada uma sessão extra ao final do pacote.</div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMode("choose")} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Voltar</button>
                <button onClick={saveJustified} disabled={busy || !reason.trim()} className="px-5 py-2 rounded-lg bg-success text-white font-semibold disabled:opacity-50">
                  {busy ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </>
          )}
          {mode === "unjustified" && (
            <>
              <div className="text-sm bg-danger/10 text-danger p-3 rounded-lg border border-danger/30">
                ⚠️ A sessão será dada como perdida. A cliente perde a sessão sem direito a reposição.
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMode("choose")} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Voltar</button>
                <button onClick={saveUnjustified} disabled={busy} className="px-5 py-2 rounded-lg bg-danger text-white font-semibold disabled:opacity-50">
                  {busy ? "Salvando..." : "Confirmar — cliente perdeu a sessão"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


function ValidateBonusModal({ pkg, onClose, onSaved }: { pkg: Package; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("packages").update({
        bonus_validated: true,
        bonus_validated_at: new Date().toISOString(),
        bonus_validated_by: user?.id ?? null,
        notes: notes || null,
      }).eq("id", pkg.id);
      if (error) {
        console.error("Erro validação bônus:", error);
        toast.error(`Erro ao validar bônus: ${error.message}`);
        return;
      }
      toast.success("Bônus validado com sucesso!");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Validar bônus</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          <div className="text-sm text-text2">
            Procedimento: <span className="font-semibold text-navy">{pkg.procedures?.name}</span><br />
            Sessões: <span className="font-semibold text-navy">{pkg.sess_total}</span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Observação (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button onClick={save} disabled={busy} className="px-5 py-2 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 disabled:opacity-50">
              {busy ? "Salvando..." : "Confirmar validação"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignSessionModal({
  clientId, pkg, session, onClose, onSaved,
}: { clientId: string; pkg: Package; session: Session; onClose: () => void; onSaved: () => void }) {
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

function SignedTermViewModal({ signedTermId, onClose }: { signedTermId: string; onClose: () => void }) {
  const [term, setTerm] = useState<{
    term_text: string;
    signature_data: string | null;
    signed_at: string | null;
    pdf_url: string | null;
    clients: { name: string } | null;
    procedures: { name: string } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("signed_terms")
      .select("term_text,signature_data,signed_at,pdf_url,clients(name),procedures(name)")
      .eq("id", signedTermId)
      .single()
      .then(({ data }) => {
        setTerm(data as typeof term);
        setLoading(false);
      });
  }, [signedTermId]);

  const downloadPDF = async () => {
    if (!term) return;
    // Usa o PDF arquivado se disponível; regera para termos antigos (fallback)
    if (term.pdf_url) {
      // pdf_url pode ser PATH (novo) ou URL completa (legado) — normaliza para path
      const pdfPath = term.pdf_url.startsWith("http")
        ? term.pdf_url.split("/signed-terms/").pop() ?? term.pdf_url
        : term.pdf_url;
      const { data: sig } = await supabase.storage.from("signed-terms").createSignedUrl(pdfPath, 3600);
      window.open(sig?.signedUrl ?? pdfPath, "_blank");
      return;
    }
    const clientName = term.clients?.name ?? "Cliente";
    const procName = term.procedures?.name ?? "Procedimento";
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Est. Beauty House Medicina e Estética", 20, 20);
    doc.setFontSize(11);
    doc.text("CNPJ: 68.438.126/0001-86", 20, 30);
    doc.text("Rua Pamplona, 925 — Jd. Paulista, São Paulo", 20, 38);
    doc.line(20, 44, 190, 44);
    doc.setFontSize(13);
    doc.text("Termo de Consentimento", 20, 54);
    doc.setFontSize(10);
    doc.text(`Cliente: ${clientName}`, 20, 65);
    doc.text(`Procedimento: ${procName}`, 20, 73);
    const signedDate = term.signed_at ? new Date(term.signed_at).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");
    doc.text(`Data: ${signedDate}`, 20, 81);
    doc.line(20, 87, 190, 87);
    const lines = doc.splitTextToSize(term.term_text, 170);
    doc.text(lines, 20, 97);
    if (term.signature_data) {
      doc.addImage(term.signature_data, "PNG", 20, 200, 80, 25);
    }
    doc.text("Assinatura da Cliente", 20, 230);
    doc.save(`Termo_${clientName.replace(/\s/g, "_")}_${procName.replace(/\s/g, "_")}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-xl text-navy">📋 Termo de Consentimento</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-text3">Carregando...</div>
        ) : !term ? (
          <div className="p-8 text-center text-danger">Termo não encontrado.</div>
        ) : (
          <div className="p-6 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-text3 text-xs uppercase">Cliente</div><div className="font-semibold text-navy">{term.clients?.name ?? "—"}</div></div>
              <div><div className="text-text3 text-xs uppercase">Procedimento</div><div className="font-semibold text-navy">{term.procedures?.name ?? "—"}</div></div>
              <div><div className="text-text3 text-xs uppercase">Data da assinatura</div><div className="font-semibold text-navy">{term.signed_at ? new Date(term.signed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}</div></div>
            </div>
            <div className="border border-border rounded-lg p-3 bg-bg2/40 max-h-48 overflow-y-auto text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {term.term_text}
            </div>
            {term.signature_data ? (
              <div className="border border-border rounded-lg p-3 bg-white flex justify-center">
                <img src={term.signature_data} alt="Assinatura" className="max-w-full max-h-32" />
              </div>
            ) : (
              <div className="text-text3 italic text-center py-4 text-sm">Sem imagem de assinatura.</div>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={downloadPDF} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2 text-sm font-semibold">
                📄 Baixar PDF
              </button>
              <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 text-sm">
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SignatureViewerModal({ clientId, pkg, session, onClose }: {
  clientId: string; pkg: Package; session: Session; onClose: () => void;
}) {
  const [info, setInfo] = useState<{ clientName?: string; profName?: string }>({});
  useEffect(() => {
    (async () => {
      const [{ data: cli }, prof] = await Promise.all([
        supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
        (async () => {
          const sess = session as Session & { signed_by?: string | null; professional_id?: string | null };
          const proId = sess.signed_by || sess.professional_id;
          if (!proId) return null;
          const { data } = await supabase.from("app_users").select("name").eq("id", proId).maybeSingle();
          return data as { name: string } | null;
        })(),
      ]);
      setInfo({ clientName: (cli as { name?: string } | null)?.name, profName: prof?.name });
    })();
  }, [clientId, session]);

  const sig = session.signature_data || session.signature_url;
  const done = session.done_at ? new Date(session.done_at) : null;

  return (
    <div className="fixed inset-0 z-50 bg-navy/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-xl w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-success">Sessão confirmada ✓</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-text3 text-xs uppercase">Profissional</div><div className="font-semibold text-navy">{info.profName ?? "—"}</div></div>
            <div><div className="text-text3 text-xs uppercase">Data</div><div className="font-semibold text-navy">{done ? done.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Data não registrada"}</div></div>
            <div><div className="text-text3 text-xs uppercase">Cliente</div><div className="font-semibold text-navy">{info.clientName ?? "—"}</div></div>
            <div><div className="text-text3 text-xs uppercase">Procedimento</div><div className="font-semibold text-navy">{pkg.procedures?.name ?? "—"}</div></div>
          </div>
          {sig ? (
            <div className="border border-border rounded-lg p-3 bg-bg2/40 flex justify-center">
              <img src={sig} alt="Assinatura" className="max-w-full max-h-64" />
            </div>
          ) : (
            <div className="text-text3 italic text-center py-6">Sem assinatura registrada.</div>
          )}
          <div className="flex justify-end">
            <button onClick={onClose} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
