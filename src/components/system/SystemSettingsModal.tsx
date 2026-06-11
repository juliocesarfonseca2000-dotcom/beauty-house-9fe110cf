// Configurações do sistema (engrenagem do módulo Usuários).
// Suporta: bônus de indicação, dados da clínica e cláusulas do contrato.
import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DEFAULT_CLAUSES, DEFAULT_CLINIC, type ClinicInfo } from "@/lib/contract-pdf";

type Proc = { id: string; name: string };
export type BonusConfig = { procedure_id: string | null; procedure_name: string | null; sessions_count: number };

const DEFAULT_BONUS: BonusConfig = { procedure_id: null, procedure_name: null, sessions_count: 5 };

export async function getBonusConfig(): Promise<BonusConfig> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", "bonus_config").maybeSingle();
  if (!data?.value) return DEFAULT_BONUS;
  return { ...DEFAULT_BONUS, ...(data.value as BonusConfig) };
}

type Tab = "bonus" | "clinica" | "contrato" | "chamados";

type Ticket = {
  id: string;
  user_name: string | null;
  user_email: string | null;
  page: string | null;
  message: string;
  created_at: string;
  resolved_at: string | null;
  email_status: string | null;
  email_error: string | null;
  email_sent_at: string | null;
};

export function SystemSettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("bonus");
  const [procs, setProcs] = useState<Proc[]>([]);
  const [procId, setProcId] = useState("");
  const [count, setCount] = useState(5);
  const [clinic, setClinic] = useState<ClinicInfo>(DEFAULT_CLINIC);
  const [clauses, setClauses] = useState<string>(DEFAULT_CLAUSES);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  const loadTickets = async () => {
    setTicketsLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("id,user_name,user_email,page,message,created_at,resolved_at,email_status,email_error,email_sent_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setTickets((data as Ticket[]) ?? []);
    setTicketsLoading(false);
  };

  useEffect(() => {
    if (tab === "chamados") void loadTickets();
  }, [tab]);

  const markResolved = async (id: string) => {
    const { error } = await supabase
      .from("support_tickets")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Chamado marcado como resolvido");
    void loadTickets();
  };

  useEffect(() => {
    (async () => {
      const [pRes, cfg, clinicRow, clausesRow] = await Promise.all([
        supabase.from("procedures").select("id,name").eq("active", true).order("name"),
        getBonusConfig(),
        supabase.from("system_settings").select("value").eq("key", "clinic_info").maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "contract_clauses").maybeSingle(),
      ]);
      setProcs((pRes.data as Proc[]) ?? []);
      setProcId(cfg.procedure_id ?? "");
      setCount(cfg.sessions_count ?? 5);
      if (clinicRow.data?.value) setClinic({ ...DEFAULT_CLINIC, ...(clinicRow.data.value as ClinicInfo) });
      const cv = clausesRow.data?.value as { text?: string } | string | null;
      if (cv) setClauses(typeof cv === "string" ? cv : (cv.text ?? DEFAULT_CLAUSES));
      setLoading(false);
    })();
  }, []);

  const saveBonus = async () => {
    setBusy(true);
    try {
      const proc = procs.find((p) => p.id === procId) ?? null;
      const value: BonusConfig = {
        procedure_id: proc?.id ?? null,
        procedure_name: proc?.name ?? null,
        sessions_count: Number(count) || 5,
      };
      const { error } = await supabase.from("system_settings")
        .upsert({ key: "bonus_config", value, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast.success("Bônus salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setBusy(false); }
  };

  const saveClinic = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("system_settings")
        .upsert({ key: "clinic_info", value: clinic, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast.success("Dados da clínica salvos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setBusy(false); }
  };

  const saveClauses = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("system_settings")
        .upsert({ key: "contract_clauses", value: { text: clauses }, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast.success("Cláusulas salvas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setBusy(false); }
  };

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button type="button" onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === id ? "border-gold text-navy" : "border-transparent text-text3 hover:text-navy"}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">Configurações do sistema</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <div className="flex border-b px-4 overflow-x-auto">
          <TabBtn id="bonus" label="Bônus de indicação" />
          <TabBtn id="clinica" label="Dados da clínica" />
          <TabBtn id="contrato" label="Cláusulas do contrato" />
          <TabBtn id="chamados" label="Chamados" />
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="text-text3 text-sm">Carregando...</div>
          ) : tab === "bonus" ? (
            <div className="space-y-3">
              <div className="text-xs text-text3">Define qual pacote é gerado automaticamente quando uma cliente é indicada.</div>
              <div>
                <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Procedimento do bônus</label>
                <select value={procId} onChange={(e) => setProcId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm">
                  <option value="">— selecione —</option>
                  {procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Quantidade de sessões</label>
                <input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm" />
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={saveBonus} disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
                  {busy ? "Salvando..." : "Salvar bônus"}
                </button>
              </div>
            </div>
          ) : tab === "clinica" ? (
            <div className="space-y-3">
              <div className="text-xs text-text3">Dados que aparecem no cabeçalho do contrato.</div>
              <div>
                <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Nome da clínica</label>
                <input value={clinic.name} onChange={(e) => setClinic({ ...clinic, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">CNPJ</label>
                  <input value={clinic.cnpj} onChange={(e) => setClinic({ ...clinic, cnpj: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Telefone</label>
                  <input value={clinic.phone} onChange={(e) => setClinic({ ...clinic, phone: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Endereço</label>
                <input value={clinic.address} onChange={(e) => setClinic({ ...clinic, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">URL do logo (opcional)</label>
                <input value={clinic.logo_url ?? ""} onChange={(e) => setClinic({ ...clinic, logo_url: e.target.value || null })} placeholder="https://..." className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm" />
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={saveClinic} disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
                  {busy ? "Salvando..." : "Salvar dados"}
                </button>
              </div>
            </div>
          ) : tab === "contrato" ? (
            <div className="space-y-3">
              <div className="text-xs text-text3">Texto livre que aparece nas cláusulas do contrato gerado.</div>
              <textarea
                value={clauses}
                onChange={(e) => setClauses(e.target.value)}
                rows={14}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm font-mono"
              />
              <div className="flex justify-between items-center">
                <button type="button" onClick={() => setClauses(DEFAULT_CLAUSES)} className="text-xs text-text3 hover:text-navy underline">
                  Restaurar padrão
                </button>
                <button type="button" onClick={saveClauses} disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
                  {busy ? "Salvando..." : "Salvar cláusulas"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-text3">Chamados de suporte enviados pelos usuários (mais recentes primeiro).</div>
                <button type="button" onClick={loadTickets} className="text-xs text-navy hover:underline">Recarregar</button>
              </div>
              {ticketsLoading ? (
                <div className="text-text3 text-sm">Carregando chamados...</div>
              ) : tickets.length === 0 ? (
                <div className="text-text3 text-sm py-6 text-center">Nenhum chamado registrado.</div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto">
                  {tickets.map((t) => (
                    <div key={t.id} className={`p-3 rounded-lg border ${t.resolved_at ? "bg-bg2 border-border opacity-60" : "bg-card border-gold/40"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-text3">
                          <span className="font-semibold text-navy">{t.user_name ?? "—"}</span>
                          {t.user_email && <span> · {t.user_email}</span>}
                          {t.page && <span> · <code className="text-[10px]">{t.page}</code></span>}
                        </div>
                        <div className="text-[10px] text-text3 whitespace-nowrap">
                          {new Date(t.created_at).toLocaleString("pt-BR")}
                        </div>
                      </div>
                      <div className="mt-1.5 text-sm text-navy whitespace-pre-wrap">{t.message}</div>
                      <div className="mt-2 flex items-center gap-2">
                        {t.email_status === "ok" ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium" title={t.email_sent_at ? `Enviado em ${new Date(t.email_sent_at).toLocaleString("pt-BR")}` : ""}>
                            ✉ Email enviado
                          </span>
                        ) : t.email_status === "error" ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium" title={t.email_error ?? ""}>
                            ✉ Email falhou{t.email_error ? `: ${t.email_error.slice(0, 80)}` : ""}
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-medium">
                            ✉ Email pendente
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex justify-end">
                        {t.resolved_at ? (
                          <span className="text-[11px] text-text3">✓ Resolvido em {new Date(t.resolved_at).toLocaleString("pt-BR")}</span>
                        ) : (
                          <span className="text-[11px] text-text3">✓ Resolvido em {new Date(t.resolved_at).toLocaleString("pt-BR")}</span>
                        ) : (
                          <button type="button" onClick={() => markResolved(t.id)} className="text-xs px-3 py-1 rounded bg-navy text-white hover:bg-navy2">
                            Marcar como resolvido
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Fechar</button>
        </div>
      </div>
    </div>
  );
}
