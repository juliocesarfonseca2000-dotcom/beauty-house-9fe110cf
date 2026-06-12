import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useEffect, useState } from "react";
import { IconPlus, IconEdit, IconArchive, IconArchiveOff, IconX, IconTrash } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/procedimentos")({
  component: ProceduresPage,
});

type Proc = {
  id: string;
  name: string;
  duration_min: number | null;
  price_single: number | null;
  price_5: number | null;
  price_10: number | null;
  price_20: number | null;
  active: boolean;
  requires_term: boolean | null;
  term_text: string | null;
  resource_id: string | null;
};

type Resource = {
  id: string;
  name: string;
  capacity: number;
  slot_minutes: number;
  active: boolean;
};

function ProceduresPage() {
  const [view, setView] = useState<"procs" | "resources">("procs");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setView("procs")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${view === "procs" ? "border-gold text-navy" : "border-transparent text-text2 hover:text-navy"}`}
        >
          Procedimentos
        </button>
        <button
          type="button"
          onClick={() => setView("resources")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${view === "resources" ? "border-gold text-navy" : "border-transparent text-text2 hover:text-navy"}`}
        >
          Recursos / Aparelhos
        </button>
      </div>
      {view === "procs" ? <ProceduresList /> : <ResourcesList />}
    </div>
  );
}

function ProceduresList() {
  const [rows, setRows] = useState<Proc[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");
  const [edit, setEdit] = useState<Proc | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: res }] = await Promise.all([
      supabase.from("procedures").select("*").order("name"),
      supabase.from("resources").select("*").eq("active", true).order("name"),
    ]);
    if (error) toast.error(error.message);
    setRows((data as Proc[]) ?? []);
    setResources((res as Resource[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (p: Proc) => {
    const { error } = await supabase.from("procedures").update({ active: !p.active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(p.active ? "Inativado" : "Reativado");
    load();
  };

  const removeProc = async (p: Proc) => {
    const { count } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .in("package_id", (await supabase.from("packages").select("id").eq("procedure_id", p.id)).data?.map((x) => x.id) ?? []);
    if ((count ?? 0) > 0) {
      toast.error(`Existem sessões vinculadas. Você só pode inativar este procedimento.`);
      return;
    }
    if (!confirm(`Deseja excluir o procedimento "${p.name}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("procedures").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Procedimento excluído");
    load();
  };

  const visible = rows.filter((r) =>
    filter === "all" ? true : filter === "active" ? r.active : !r.active,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-bg2 rounded-lg p-1 text-sm">
          {(["active", "inactive", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md font-semibold transition ${
                filter === f ? "bg-navy text-white" : "text-text2 hover:text-navy"
              }`}
            >
              {f === "active" ? "Ativos" : f === "inactive" ? "Inativos" : "Todos"}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2.5 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center gap-2"
        >
          <IconPlus size={18} /> Novo procedimento
        </button>
      </div>

      <div className="bh-card overflow-x-auto">
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-text3">Nenhum procedimento.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-left px-4 py-3 font-semibold">Duração</th>
                <th className="text-left px-4 py-3 font-semibold">Recurso</th>
                <th className="text-right px-4 py-3 font-semibold">Avulso</th>
                <th className="text-right px-4 py-3 font-semibold">5 sess.</th>
                <th className="text-right px-4 py-3 font-semibold">10 sess.</th>
                <th className="text-right px-4 py-3 font-semibold">20 sess.</th>
                <th className="text-right px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p, i) => (
                <tr key={p.id} className={i % 2 ? "bg-bg2/40" : ""}>
                  <td className="px-4 py-3 font-semibold text-navy">{p.name}</td>
                  <td className="px-4 py-3 text-text2">{p.duration_min}min</td>
                  <td className="px-4 py-3 text-text2 text-xs">
                    {resources.find((r) => r.id === p.resource_id)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-text2">{fmt(p.price_single)}</td>
                  <td className="px-4 py-3 text-right text-text2">{fmt(p.price_5)}</td>
                  <td className="px-4 py-3 text-right text-text2">{fmt(p.price_10)}</td>
                  <td className="px-4 py-3 text-right text-text2">{fmt(p.price_20)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`bh-badge ${p.active ? "bg-success/10 text-success" : "bg-text3/15 text-text3"}`}>
                      {p.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setEdit(p)} className="p-1.5 rounded-md hover:bg-bg2 text-navy" title="Editar">
                      <IconEdit size={16} />
                    </button>
                    <button onClick={() => toggleActive(p)} className="p-1.5 rounded-md hover:bg-bg2 text-text2" title={p.active ? "Inativar" : "Reativar"}>
                      {p.active ? <IconArchive size={16} /> : <IconArchiveOff size={16} />}
                    </button>
                    <button onClick={() => removeProc(p)} className="p-1.5 rounded-md hover:bg-danger/10 text-danger" title="Excluir">
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || edit) && (
        <ProcModal
          initial={edit}
          resources={resources}
          onClose={() => { setEdit(null); setCreating(false); }}
          onSaved={() => { setEdit(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function fmt(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

function ProcModal({ initial, resources, onClose, onSaved }: { initial: Proc | null; resources: Resource[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [duration, setDuration] = useState(initial?.duration_min?.toString() ?? "60");
  const [single, setSingle] = useState(initial?.price_single?.toString() ?? "");
  const [p5, setP5] = useState(initial?.price_5?.toString() ?? "");
  const [p10, setP10] = useState(initial?.price_10?.toString() ?? "");
  const [p20, setP20] = useState(initial?.price_20?.toString() ?? "");
  const [requiresTerm, setRequiresTerm] = useState<boolean>(initial?.requires_term ?? false);
  const [termText, setTermText] = useState(initial?.term_text ?? "");
  const [resourceId, setResourceId] = useState(initial?.resource_id ?? "");
  const [busy, setBusy] = useState(false);
  const [pros, setPros] = useState<{ id: string; name: string }[]>([]);
  const [selectedPros, setSelectedPros] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: prosData } = await supabase
        .from("app_users").select("id,name")
        .eq("active", true).eq("role", "professional").order("name");
      setPros((prosData as { id: string; name: string }[]) ?? []);
      if (initial) {
        const { data: links } = await supabase
          .from("procedure_professionals").select("professional_id")
          .eq("procedure_id", initial.id);
        setSelectedPros(new Set(((links as { professional_id: string }[]) ?? []).map((l) => l.professional_id)));
      }
    })();
  }, [initial]);

  const togglePro = (id: string) => {
    setSelectedPros((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };


  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome obrigatório");
    setBusy(true);
    const payload = {
      name: name.trim(),
      duration_min: Number(duration) || 60,
      price_single: single ? Number(single) : null,
      price_5: p5 ? Number(p5) : null,
      price_10: p10 ? Number(p10) : null,
      price_20: p20 ? Number(p20) : null,
      requires_term: requiresTerm,
      term_text: requiresTerm ? (termText.trim() || null) : null,
      resource_id: resourceId || null,
    };
    let procId = initial?.id;
    if (initial) {
      const { error } = await supabase.from("procedures").update(payload).eq("id", initial.id);
      if (error) { setBusy(false); return toast.error(error.message); }
    } else {
      const { data: created, error } = await supabase.from("procedures").insert(payload).select("id").single();
      if (error) { setBusy(false); return toast.error(error.message); }
      procId = (created as { id: string }).id;
    }
    // Sync procedure_professionals
    if (procId) {
      await supabase.from("procedure_professionals").delete().eq("procedure_id", procId);
      if (selectedPros.size > 0) {
        await supabase.from("procedure_professionals").insert(
          Array.from(selectedPros).map((pid) => ({ procedure_id: procId!, professional_id: pid })),
        );
      }
    }
    setBusy(false);
    toast.success(initial ? "Atualizado!" : "Criado!");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">{initial ? "Editar procedimento" : "Novo procedimento"}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <FieldRow>
            <Field label="Nome*"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} required /></Field>
            <Field label="Duração (min)"><input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className={inp} /></Field>
          </FieldRow>
          <FieldRow>
            <Field label="Preço avulso (R$)"><input type="number" step="0.01" value={single} onChange={(e) => setSingle(e.target.value)} className={inp} /></Field>
            <Field label="Pacote 5x (R$)"><input type="number" step="0.01" value={p5} onChange={(e) => setP5(e.target.value)} className={inp} /></Field>
          </FieldRow>
          <FieldRow>
            <Field label="Pacote 10x (R$)"><input type="number" step="0.01" value={p10} onChange={(e) => setP10(e.target.value)} className={inp} /></Field>
            <Field label="Pacote 20x (R$)"><input type="number" step="0.01" value={p20} onChange={(e) => setP20(e.target.value)} className={inp} /></Field>
          </FieldRow>

          <Field label="Recurso / Aparelho vinculado (opcional)">
            <select value={resourceId} onChange={(e) => setResourceId(e.target.value)} className={inp}>
              <option value="">— Nenhum —</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>{r.name} (cap. {r.capacity}, slot {r.slot_minutes}min)</option>
              ))}
            </select>
          </Field>

          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">
              Profissionais habilitadas
            </label>
            <div className="text-xs text-text3 mb-2">Marque quem pode realizar este procedimento. Se nenhuma for marcada, todas podem realizar.</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-2 bg-bg2/40 rounded-lg border border-border">
              {pros.length === 0 ? (
                <div className="text-text3 text-xs">Nenhuma profissional cadastrada.</div>
              ) : pros.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-bg2 px-2 py-1 rounded">
                  <input type="checkbox" checked={selectedPros.has(p.id)} onChange={() => togglePro(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>


          <div className="border-t pt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-navy">
              <input type="checkbox" checked={requiresTerm} onChange={(e) => setRequiresTerm(e.target.checked)} />
              Exige termo de consentimento (assinado antes da 1ª sessão)
            </label>
            {requiresTerm && (
              <Field label="Texto do termo">
                <textarea
                  value={termText}
                  onChange={(e) => setTermText(e.target.value)}
                  rows={6}
                  placeholder="Digite o texto do termo que será exibido para a cliente assinar..."
                  className={inp}
                />
              </Field>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
              {busy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResourcesList() {
  const [rows, setRows] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Resource | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("resources").select("*").order("name");
    if (error) toast.error(error.message);
    setRows((data as Resource[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (r: Resource) => {
    const { error } = await supabase.from("resources").update({ active: !r.active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2.5 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center gap-2"
        >
          <IconPlus size={18} /> Novo recurso
        </button>
      </div>
      <div className="bh-card overflow-x-auto">
        {loading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-text3">Nenhum recurso cadastrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-right px-4 py-3 font-semibold">Capacidade</th>
                <th className="text-right px-4 py-3 font-semibold">Slot (min)</th>
                <th className="text-right px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={i % 2 ? "bg-bg2/40" : ""}>
                  <td className="px-4 py-3 font-semibold text-navy">{r.name}</td>
                  <td className="px-4 py-3 text-right">{r.capacity}</td>
                  <td className="px-4 py-3 text-right">{r.slot_minutes}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`bh-badge ${r.active ? "bg-success/10 text-success" : "bg-text3/15 text-text3"}`}>
                      {r.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setEdit(r)} className="p-1.5 rounded-md hover:bg-bg2 text-navy"><IconEdit size={16} /></button>
                    <button type="button" onClick={() => toggleActive(r)} className="p-1.5 rounded-md hover:bg-bg2 text-text2">
                      {r.active ? <IconArchive size={16} /> : <IconArchiveOff size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(creating || edit) && (
        <ResourceModal
          initial={edit}
          onClose={() => { setEdit(null); setCreating(false); }}
          onSaved={() => { setEdit(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function ResourceModal({ initial, onClose, onSaved }: { initial: Resource | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity?.toString() ?? "1");
  const [slot, setSlot] = useState(initial?.slot_minutes?.toString() ?? "60");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome obrigatório");
    setBusy(true);
    const payload = {
      name: name.trim(),
      capacity: Math.max(1, Number(capacity) || 1),
      slot_minutes: Math.max(5, Number(slot) || 60),
    };
    const { error } = initial
      ? await supabase.from("resources").update(payload).eq("id", initial.id)
      : await supabase.from("resources").insert({ ...payload, active: true });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(initial ? "Atualizado!" : "Criado!");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">{initial ? "Editar recurso" : "Novo recurso"}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <Field label="Nome*"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} required /></Field>
          <FieldRow>
            <Field label="Capacidade*"><input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inp} required /></Field>
            <Field label="Duração do slot (min)*"><input type="number" min={5} value={slot} onChange={(e) => setSlot(e.target.value)} className={inp} required /></Field>
          </FieldRow>
          <div className="text-xs text-text3">
            Ex.: Sala de Massagem cap. 3, slot 60. Aparelho Ecos cap. 1, slot 20.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2 hover:bg-bg2">Cancelar</button>
            <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50">
              {busy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inp = "w-full px-3 py-2 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-gold/40 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">{label}</label>{children}</div>;
}
function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}
