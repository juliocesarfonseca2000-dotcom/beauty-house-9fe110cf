import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/with-timeout";
import { toast } from "sonner";

type Evaluator = { id: string; name: string; is_evaluator?: boolean };

export function ClientFormModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [cpf, setCpf] = useState("");
  const [referral, setReferral] = useState("");
  const [referralClientId, setReferralClientId] = useState<string | null>(null);
  const [evaluatorId, setEvaluatorId] = useState("");
  const [notes, setNotes] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [refSearch, setRefSearch] = useState("");
  const [refResults, setRefResults] = useState<Evaluator[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("app_users")
      .select("id,name,is_evaluator")
      .eq("active", true)
      .or("role.eq.admin,is_evaluator.eq.true")
      .order("name")
      .then(({ data }) => {
        if (active) setEvaluators((data as Evaluator[]) ?? []);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (referral !== "Indicação" || refSearch.length < 2) {
      setRefResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await withTimeout(supabase
          .from("clients")
          .select("id,name")
          .ilike("name", `%${refSearch}%`)
          .eq("active", true)
          .limit(5), 8000, "Busca de indicação");
        setRefResults((data as Evaluator[]) ?? []);
      } catch {
        setRefResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [refSearch, referral]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Nome e WhatsApp são obrigatórios");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        birthdate: birthdate || null,
        cpf: cpf.trim() || null,
        referral: referral || null,
        referral_client_id: referral === "Indicação" ? referralClientId : null,
        evaluator_id: evaluatorId || null,
        notes: notes.trim() || null,
        gender: gender || null,
        address: address.trim() || null,
      };
      const { data: created, error } = await withTimeout<{ data: { id: string } | null; error: { message: string } | null }>(
        supabase.from("clients").insert(payload).select("id").single(),
        12000,
        "Cadastro de cliente",
      );
      if (error) throw error;
      const newId = (created as { id: string }).id;

      // Bônus de indicação — dispara em paralelo, não bloqueia o redirect
      if (referral === "Indicação" && referralClientId) {
        const bonusPromise = (async () => {
          const { getBonusConfig } = await import("@/components/system/SystemSettingsModal");
          const cfg = await getBonusConfig();
          const sessionsCount = cfg.sessions_count ?? 5;
          const procName = cfg.procedure_name ?? "Massagem Comum 40'";
          const description = `${procName} — ${sessionsCount} sessões · Bônus indicação`;

          await Promise.all([
            supabase.from("referral_bonuses").insert({
              from_client_id: referralClientId,
              to_client_name: name.trim(),
              awarded: true,
            }),
            supabase.from("income").insert({
              client_id: referralClientId,
              description,
              amount: 0,
              pay_method: "bonus",
            }),
          ]);

          // Cria o pacote de brinde + sessões pendentes, para aparecer na aba Sessões
          if (cfg.procedure_id) {
            const { data: pkg, error: pkgErr } = await supabase
              .from("packages")
              .insert({
                client_id: referralClientId,
                procedure_id: cfg.procedure_id,
                sess_total: sessionsCount,
                sess_done: 0,
                price_full: 0,
                price_paid: 0,
                discount_pct: 0,
                pay_method: "bonus",
                status: "active",
                is_bonus: true,
              })
              .select("id")
              .single();
            if (pkgErr) throw pkgErr;
            const sessRows = Array.from({ length: sessionsCount }, (_, i) => ({
              package_id: (pkg as { id: string }).id,
              client_id: referralClientId,
              session_num: i + 1,
              status: "pending",
            }));
            await supabase.from("sessions").insert(sessRows);
          }
        })();
        // Não await — segue o fluxo. Só logamos erro silenciosamente.
        bonusPromise.catch((e) => console.error("Bônus indicação falhou:", e));
      }


      toast.success("Cliente cadastrada!");
      onCreated(newId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao cadastrar";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Nova cliente</div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2">
            <IconX size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Número da ficha"><input type="number" value={recordNum} onChange={(e) => setRecordNum(e.target.value)} className={input} placeholder="Automático" /></Field>
            <Field label="Nome*"><input value={name} onChange={(e) => setName(e.target.value)} className={input} required /></Field>
            <Field label="WhatsApp*"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={input} required placeholder="11999999999" /></Field>
            <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} /></Field>
            <Field label="Nascimento"><input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className={input} /></Field>
            <Field label="CPF"><input value={cpf} onChange={(e) => setCpf(e.target.value)} className={input} /></Field>
            <Field label="Como conheceu">
              <select value={referral} onChange={(e) => { setReferral(e.target.value); setReferralClientId(null); }} className={input}>
                <option value="">Selecionar...</option>
                <option>Indicação</option>
                <option>Instagram</option>
                <option>Google</option>
                <option>Outro</option>
              </select>
            </Field>
          </div>

          {referral === "Indicação" && (
            <Field label="Quem indicou?">
              <input
                value={refSearch}
                onChange={(e) => { setRefSearch(e.target.value); setReferralClientId(null); }}
                className={input}
                placeholder="Digite o nome da cliente..."
              />
              {refResults.length > 0 && !referralClientId && (
                <div className="mt-1 bh-card max-h-40 overflow-y-auto">
                  {refResults.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => { setReferralClientId(c.id); setRefSearch(c.name); setRefResults([]); }}
                      className="w-full text-left px-3 py-2 hover:bg-bg2 text-sm"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {referralClientId && (
                <div className="text-xs text-success mt-1">✓ Bônus de 5 sessões de Massagem 40' será creditado</div>
              )}
            </Field>
          )}

          <Field label="Avaliadora">
            <select value={evaluatorId} onChange={(e) => setEvaluatorId(e.target.value)} className={input}>
              <option value="">Selecionar...</option>
              {evaluators.map((e) => <option key={e.id} value={e.id}>{e.is_evaluator ? "★ " : ""}{e.name}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Sexo">
              <select value={gender} onChange={(e) => setGender(e.target.value)} className={input}>
                <option value="">Selecionar...</option>
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
                <option value="Outro">Outro</option>
              </select>
            </Field>
            <Field label="Endereço">
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={input} placeholder="Rua, número, bairro, cidade" />
            </Field>
          </div>

          <Field label="Observações">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={input} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
              {busy ? "Salvando..." : "Cadastrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const input = "w-full px-3 py-2 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-gold/40 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}
