import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { IconX } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { withTimeout } from "@/lib/with-timeout";

type Package = {
  id: string;
  procedure_id: string;
  sess_total: number;
  sess_done: number;
  procedures: { name: string } | null;
};
type Session = {
  id: string;
  package_id: string;
  session_num: number;
  status: "pending" | "done" | "missed";
  done_at: string | null;
  signature_url: string | null;
  notes: string | null;
};
type Professional = { id: string; name: string };

export function SessionsTab({ clientId }: { clientId: string }) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState<{ pkg: Package; session: Session } | null>(null);
  const [viewSig, setViewSig] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: pkgs } = await supabase
      .from("packages")
      .select("id,procedure_id,sess_total,sess_done,procedures(name)")
      .eq("client_id", clientId)
      .eq("status", "active")
      .order("created_at");
    const list = (pkgs as unknown as Package[]) ?? [];
    setPackages(list);
    if (list.length) {
      const ids = list.map((p) => p.id);
      const { data: sess } = await supabase
        .from("sessions")
        .select("id,package_id,session_num,status,done_at,signature_url,notes")
        .in("package_id", ids)
        .order("session_num");
      setSessions((sess as Session[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const { data: pkgs } = await supabase
        .from("packages")
        .select("id,procedure_id,sess_total,sess_done,procedures(name)")
        .eq("client_id", clientId)
        .eq("status", "active")
        .order("created_at");
      if (!active) return;
      const list = (pkgs as unknown as Package[]) ?? [];
      setPackages(list);
      if (list.length) {
        const ids = list.map((p) => p.id);
        const { data: sess } = await supabase
          .from("sessions")
          .select("id,package_id,session_num,status,done_at,signature_url,notes")
          .in("package_id", ids)
          .order("session_num");
        if (!active) return;
        setSessions((sess as Session[]) ?? []);
      } else {
        setSessions([]);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [clientId]);

  if (loading) return <TableSkeleton rows={4} cols={6} />;
  if (packages.length === 0)
    return <div className="bh-card p-12 text-center"><div className="font-display text-xl text-navy mb-1">Nenhum pacote ativo</div><div className="text-text3 text-sm">Use "Fechar pacote" para começar.</div></div>;

  return (
    <div className="space-y-5">
      {packages.map((pkg) => {
        const pkgSess = sessions.filter((s) => s.package_id === pkg.id).sort((a, b) => a.session_num - b.session_num);
        const done = pkgSess.filter((s) => s.status === "done").length;
        const nextIdx = pkgSess.findIndex((s) => s.status === "pending");
        return (
          <div key={pkg.id} className="bh-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-display text-lg text-navy">{pkg.procedures?.name}</div>
                <div className="text-text2 text-sm">{done} de {pkgSess.length} realizadas</div>
              </div>
            </div>
            <div className="w-full h-2 bg-bg2 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-gold transition-all" style={{ width: `${(done / Math.max(pkgSess.length, 1)) * 100}%` }} />
            </div>
            <div className="flex flex-wrap gap-2">
              {pkgSess.map((s, i) => {
                const isNext = i === nextIdx;
                const cls =
                  s.status === "done"
                    ? "bg-success text-white"
                    : s.status === "missed"
                    ? "bg-danger text-white"
                    : isNext
                    ? "bg-gold text-white cursor-pointer hover:bg-gold2"
                    : "bg-bg2 text-text3";
                return (
                  <button
                    key={s.id}
                    disabled={!isNext && s.status === "pending"}
                    onClick={() => {
                      if (s.status === "done" && s.signature_url) setViewSig(s.signature_url);
                      else if (isNext) setSigning({ pkg, session: s });
                    }}
                    className={`relative w-11 h-11 rounded-md text-sm font-semibold ${cls} transition`}
                  >
                    {s.session_num}
                    {s.status === "done" && s.signature_url && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-gold rounded-full border-2 border-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {signing && (
        <SignSessionModal
          clientId={clientId}
          pkg={signing.pkg}
          session={signing.session}
          onClose={() => setSigning(null)}
          onSaved={() => { setSigning(null); load(); }}
        />
      )}
      {viewSig && (
        <div className="fixed inset-0 z-50 bg-navy/70 flex items-center justify-center p-4" onClick={() => setViewSig(null)}>
          <div className="bh-card p-4 max-w-2xl">
            <img src={viewSig} alt="Assinatura" className="max-w-full" />
          </div>
        </div>
      )}
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
    (async () => {
      const { data } = await supabase
        .from("app_users")
        .select("id,name")
        .eq("active", true)
        .eq("role", "professional")
        .order("name");
      setPros((data as Professional[]) ?? []);
    })();
  }, []);

  const confirm = async () => {
    if (!hasInk || sigRef.current?.isEmpty()) {
      toast.error("A cliente precisa assinar antes de confirmar.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = sigRef.current!.getCanvas().toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${clientId}/${session.id}.png`;
      const { error: upErr } = await withTimeout(supabase.storage.from("signatures").upload(path, blob, { upsert: true, contentType: "image/png" }), 12000, "Upload da assinatura");
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("signatures").getPublicUrl(path);
      const { error } = await withTimeout(supabase.from("sessions").update({
        status: "done",
        done_at: new Date().toISOString(),
        professional_id: proId || null,
        signature_url: pub.publicUrl,
        notes: notes || null,
      }).eq("id", session.id), 12000, "Confirmação da sessão");
      if (error) throw error;
      await withTimeout(supabase.from("packages").update({ sess_done: pkg.sess_done + 1 }).eq("id", pkg.id), 12000, "Atualização do pacote");
      toast.success("Sessão confirmada!");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar");
    } finally {
      setBusy(false);
    }
  };

  const markMissed = async () => {
    if (!window.confirm("Marcar como falta? A sessão não será descontada — um novo slot será adicionado ao final do pacote.")) return;
    setBusy(true);
    try {
      // marca falta
      await withTimeout(supabase.from("sessions").update({ status: "missed", done_at: new Date().toISOString() }).eq("id", session.id), 12000, "Registro da falta");
      // adiciona slot novo ao final
      const newNum = pkg.sess_total + 1;
      await withTimeout(supabase.from("sessions").insert({
        package_id: pkg.id, client_id: clientId, session_num: newNum, status: "pending",
      }), 12000, "Novo slot da sessão");
      await withTimeout(supabase.from("packages").update({ sess_total: newNum }).eq("id", pkg.id), 12000, "Atualização do pacote");
      toast.success("Falta registrada. Slot extra adicionado.");
      onSaved();
    } catch (e) {
      toast.error("Erro ao registrar falta");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Sessão #{session.session_num}</div>
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
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Assinatura da cliente</label>
            <div className="border-2 border-dashed border-gold/40 rounded-lg bg-bg2 relative">
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{ className: "w-full h-40 rounded-lg" }}
                onBegin={() => setHasInk(true)}
                penColor="#12283F"
              />
              {!hasInk && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-text3 text-sm">
                  Peça para a cliente assinar aqui com o dedo
                </div>
              )}
            </div>
            <button onClick={() => { sigRef.current?.clear(); setHasInk(false); }} className="text-xs text-text2 hover:text-navy mt-2">Limpar</button>
          </div>
          <div className="flex justify-between gap-2 pt-2">
            <button onClick={markMissed} disabled={busy} className="px-4 py-2 rounded-lg border border-danger text-danger text-sm font-semibold hover:bg-danger/10">Marcar falta</button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
              <button
                onClick={confirm}
                disabled={!hasInk || busy}
                className="px-5 py-2 rounded-lg bg-success text-white font-semibold disabled:opacity-40"
              >
                {busy ? "Salvando..." : "Confirmar presença"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
