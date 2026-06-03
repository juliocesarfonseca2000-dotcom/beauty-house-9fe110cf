import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowLeft, IconEdit, IconCheck } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SessionsTab } from "@/components/clients/SessionsTab";
import { PhotosTab } from "@/components/clients/PhotosTab";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { withTimeout } from "@/lib/with-timeout";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  component: ClientDetailPage,
});

type Client = {
  id: string;
  record_num: number;
  name: string;
  phone: string | null;
  email: string | null;
  birthdate: string | null;
  cpf: string | null;
  referral: string | null;
  notes: string | null;
  anamnese: Record<string, unknown> | null;
  weight: number | null; waist: number | null; hip: number | null;
  abdomen: number | null; arm: number | null; thigh: number | null;
  evaluator_id: string | null;
  created_at: string;
};

type Tab = "dados" | "prontuario" | "anamnese" | "sessoes" | "fotos" | "historico";
type Evaluator = { id: string; name: string };

function ClientDetailPage() {
  const { id } = Route.useParams();
  return <ClientRecordContent id={id} backTo="/clientes" />;
}

export function ClientRecordContent({ id, backTo = "/clientes" }: { id: string; backTo?: "/clientes" | "/ficha" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("sessoes");

  const { data: client, isLoading, isError, error } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase.from("clients").select("*").eq("id", id).maybeSingle(),
        10000,
        "Carregamento da cliente",
      );
      if (error) throw error;
      return data as Client | null;
    },
  });

  const reloadClient = () => {
    queryClient.invalidateQueries({ queryKey: ["client", id] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
  };

  if (isLoading) return <ClientDetailSkeleton />;
  if (isError) return <div className="bh-card p-6 text-danger text-sm">{error instanceof Error ? error.message : "Erro ao carregar cliente."}</div>;
  if (!client) return <div className="text-text3">Cliente não encontrada.</div>;

  const initials = client.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

  return (
    <div className="space-y-5">
      <button onClick={() => navigate({ to: backTo })} className="text-text2 hover:text-navy text-sm flex items-center gap-1">
        <IconArrowLeft size={16} /> Voltar para {backTo === "/ficha" ? "Ficha & Sessões" : "Clientes"}
      </button>

      <div className="bh-card p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gold/15 text-gold font-display text-2xl flex items-center justify-center">
          {initials}
        </div>
        <div className="flex-1">
          <div className="font-display text-2xl text-navy">{client.name}</div>
          <div className="text-text2 text-sm">
            Ficha #{client.record_num} · {client.phone ?? "sem telefone"} ·
            Desde {new Date(client.created_at).toLocaleDateString("pt-BR")}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {([
          ["dados", "Dados"],
          ["prontuario", "Prontuário"],
          ["anamnese", "Anamnese"],
          ["sessoes", "Sessões"],
          ["fotos", "Fotos"],
          ["historico", "Histórico $"],
        ] as [Tab, string][]).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              tab === k ? "border-gold text-navy" : "border-transparent text-text2 hover:text-navy"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "dados" && <DadosTab client={client} onSaved={reloadClient} />}
      {tab === "prontuario" && <ProntuarioTab client={client} onSaved={reloadClient} />}
      {tab === "anamnese" && <AnamneseTab client={client} onSaved={reloadClient} />}
      {tab === "sessoes" && <SessionsTab clientId={client.id} />}
      {tab === "fotos" && <PhotosTab clientId={client.id} />}
      {tab === "historico" && <HistoricoTab clientId={client.id} />}
    </div>
  );
}

function DadosTab({ client, onSaved }: { client: Client; onSaved: () => void }) {
  const [edit, setEdit] = useState(false);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [f, setF] = useState({
    record_num: String(client.record_num ?? ""), name: client.name, phone: client.phone ?? "", email: client.email ?? "",
    birthdate: client.birthdate ?? "", cpf: client.cpf ?? "", referral: client.referral ?? "", evaluator_id: client.evaluator_id ?? "", notes: client.notes ?? "",
  });
  useEffect(() => {
    let active = true;
    withTimeout(supabase.from("app_users").select("id,name").eq("active", true).or("role.eq.admin,is_evaluator.eq.true").order("name"), 10000, "Carregamento das avaliadoras").then(({ data }) => {
      if (active) setEvaluators((data as Evaluator[]) ?? []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const save = async () => {
    try {
      const { error } = await withTimeout(supabase.from("clients").update({
        ...f,
        record_num: Number(f.record_num),
        birthdate: f.birthdate || null,
        evaluator_id: f.evaluator_id || null,
        referral: f.referral || null,
      }).eq("id", client.id), 12000, "Atualização dos dados");
      if (error) throw error;
      toast.success("Dados atualizados");
      setEdit(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar dados");
    }
  };
  return (
    <div className="bh-card p-6 space-y-4">
      <div className="flex justify-end">
        {edit ? (
          <button onClick={save} className="px-4 py-2 rounded-lg bg-success text-white text-sm font-semibold flex items-center gap-2"><IconCheck size={16} /> Salvar</button>
        ) : (
          <button onClick={() => setEdit(true)} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2 text-sm flex items-center gap-2"><IconEdit size={16} /> Editar</button>
        )}
      </div>
      <Grid>
        <RO label="Número da ficha" v={f.record_num} edit={edit} type="number" onChange={(v) => setF({ ...f, record_num: v })} />
        <RO label="Nome" v={f.name} edit={edit} onChange={(v) => setF({ ...f, name: v })} />
        <RO label="WhatsApp" v={f.phone} edit={edit} onChange={(v) => setF({ ...f, phone: v })} />
        <RO label="Email" v={f.email} edit={edit} onChange={(v) => setF({ ...f, email: v })} />
        <RO label="Nascimento" v={f.birthdate} edit={edit} type="date" onChange={(v) => setF({ ...f, birthdate: v })} />
        <RO label="CPF" v={f.cpf} edit={edit} onChange={(v) => setF({ ...f, cpf: v })} />
        <SelectRO label="Como conheceu" value={f.referral} edit={edit} options={["Indicação", "Instagram", "Google", "Outro"]} onChange={(v) => setF({ ...f, referral: v })} />
        <SelectRO label="Avaliadora" value={f.evaluator_id} edit={edit} options={evaluators.map((e) => ({ value: e.id, label: e.name }))} onChange={(v) => setF({ ...f, evaluator_id: v })} display={evaluators.find((e) => e.id === f.evaluator_id)?.name} />
      </Grid>
      <div>
        <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Observações</label>
        {edit ? (
          <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
        ) : (
          <div className="text-text2 text-sm">{f.notes || "—"}</div>
        )}
      </div>
    </div>
  );
}

function ProntuarioTab({ client, onSaved }: { client: Client; onSaved: () => void }) {
  const a = (client.anamnese ?? {}) as Record<string, unknown>;
  const [an, setAn] = useState({
    diseases: (a.diseases as string) ?? "",
    allergies: (a.allergies as string) ?? "",
    medications: (a.medications as string) ?? "",
    surgeries: (a.surgeries as string) ?? "",
    pregnant: !!a.pregnant,
    pacemaker: !!a.pacemaker,
    coagulation: !!a.coagulation,
    notes: (a.notes as string) ?? "",
    hist_estetico: (a.hist_estetico as string) ?? "",
  });
  const [m, setM] = useState({
    weight: client.weight ?? "", waist: client.waist ?? "", hip: client.hip ?? "",
    abdomen: client.abdomen ?? "", arm: client.arm ?? "", thigh: client.thigh ?? "",
  });
  const saveAn = async () => {
    try {
      const { error } = await withTimeout(supabase.from("clients").update({ anamnese: an }).eq("id", client.id), 12000, "Salvamento da anamnese");
      if (error) throw error;
      toast.success("Anamnese salva"); onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar anamnese");
    }
  };
  const saveM = async () => {
    const payload = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v === "" ? null : Number(v)]));
    try {
      const { error } = await withTimeout(supabase.from("clients").update(payload).eq("id", client.id), 12000, "Salvamento das medidas");
      if (error) throw error;
      toast.success("Medidas salvas"); onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar medidas");
    }
  };
  return (
    <div className="space-y-5">
      <div className="bh-card p-6 space-y-4">
        <div className="font-display text-lg text-navy">Ficha de anamnese</div>
        <Grid>
          <TA label="Doenças crônicas" v={an.diseases} onChange={(v) => setAn({ ...an, diseases: v })} />
          <TA label="Alergias" v={an.allergies} onChange={(v) => setAn({ ...an, allergies: v })} />
          <TA label="Medicamentos em uso" v={an.medications} onChange={(v) => setAn({ ...an, medications: v })} />
          <TA label="Cirurgias recentes" v={an.surgeries} onChange={(v) => setAn({ ...an, surgeries: v })} />
        </Grid>
        <div className="flex flex-wrap gap-4 pt-2">
          <Check label="Gestante/Amamentando" v={an.pregnant} onChange={(v) => setAn({ ...an, pregnant: v })} />
          <Check label="Marca-passo/Implante metálico" v={an.pacemaker} onChange={(v) => setAn({ ...an, pacemaker: v })} />
          <Check label="Problema de coagulação" v={an.coagulation} onChange={(v) => setAn({ ...an, coagulation: v })} />
        </div>
        <TA label="Condições raras / Observações médicas" v={an.notes} onChange={(v) => setAn({ ...an, notes: v })} />
        <TA label="Histórico estético de outras clínicas" v={an.hist_estetico} onChange={(v) => setAn({ ...an, hist_estetico: v })} />
        <div className="flex justify-end">
          <button onClick={saveAn} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2">Salvar anamnese</button>
        </div>
      </div>

      <div className="bh-card p-6 space-y-4">
        <div className="font-display text-lg text-navy">Medidas corporais</div>
        <Grid>
          {(["weight", "waist", "hip", "abdomen", "arm", "thigh"] as const).map((k) => (
            <RO key={k} label={LBL[k]} v={String(m[k] ?? "")} edit type="number" onChange={(v) => setM({ ...m, [k]: v })} />
          ))}
        </Grid>
        <div className="flex justify-end">
          <button onClick={saveM} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2">Salvar medidas</button>
        </div>
      </div>
    </div>
  );
}

const LBL: Record<string, string> = { weight: "Peso (kg)", waist: "Cintura (cm)", hip: "Quadril (cm)", abdomen: "Abdômen (cm)", arm: "Braço (cm)", thigh: "Coxa (cm)" };

function HistoricoTab({ clientId }: { clientId: string }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["client-income", clientId],
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase.from("income").select("id,description,amount,pay_method,date").eq("client_id", clientId).order("date", { ascending: false }),
        10000,
        "Carregamento do histórico",
      );
      if (error) throw error;
      return (data as Array<{ id: string; description: string; amount: number; pay_method: string | null; date: string }>) ?? [];
    },
  });
  if (isLoading) return <TableSkeleton rows={4} cols={4} />;
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const paid = rows.filter((r) => Number(r.amount) > 0);
  const avg = paid.length ? total / paid.length : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bh-card p-5"><div className="text-xs uppercase text-text3">Total investido</div><div className="font-display text-3xl text-navy">R$ {total.toFixed(2)}</div></div>
        <div className="bh-card p-5"><div className="text-xs uppercase text-text3">Ticket médio</div><div className="font-display text-3xl text-navy">R$ {avg.toFixed(2)}</div></div>
      </div>
      <div className="bh-card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-text3 text-sm">Nenhum lançamento.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2"><tr><th className="text-left px-4 py-2.5">Descrição</th><th className="text-left px-4 py-2.5">Data</th><th className="text-left px-4 py-2.5">Pagto</th><th className="text-right px-4 py-2.5">Valor</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5">{r.description}</td>
                  <td className="px-4 py-2.5 text-text2">{new Date(r.date).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-2.5 text-text2">{r.pay_method ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    {Number(r.amount) === 0 ? <span className="bh-badge bg-gold/15 text-gold">Bônus</span> : `R$ ${Number(r.amount).toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

function ClientDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-5 w-36 rounded-md bg-bg2 animate-pulse" />
      <div className="bh-card p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-bg2 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-52 rounded-md bg-bg2 animate-pulse" />
          <div className="h-4 w-80 max-w-full rounded-md bg-bg2 animate-pulse" />
        </div>
      </div>
      <TableSkeleton rows={4} cols={3} />
    </div>
  );
}

function RO({ label, v, edit, onChange, type = "text" }: { label: string; v: string | null; edit?: boolean; onChange?: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>
      {edit ? (
        <input type={type} value={v ?? ""} onChange={(e) => onChange?.(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
      ) : (
        <div className="text-text2 text-sm">{v || "—"}</div>
      )}
    </div>
  );
}
function SelectRO({ label, value, edit, options, onChange, display }: { label: string; value: string; edit?: boolean; options: Array<string | { value: string; label: string }>; onChange: (v: string) => void; display?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>
      {edit ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm">
          <option value="">Selecionar...</option>
          {options.map((o) => {
            const opt = typeof o === "string" ? { value: o, label: o } : o;
            return <option key={opt.value} value={opt.value}>{opt.label}</option>;
          })}
        </select>
      ) : (
        <div className="text-text2 text-sm">{display || value || "—"}</div>
      )}
    </div>
  );
}
function TA({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>
      <textarea value={v} onChange={(e) => onChange(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
    </div>
  );
}
function Check({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={v} onChange={(e) => onChange(e.target.checked)} className="rounded text-gold focus:ring-gold" />
      {label}
    </label>
  );
}
