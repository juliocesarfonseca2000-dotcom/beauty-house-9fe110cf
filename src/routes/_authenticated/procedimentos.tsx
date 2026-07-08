import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useEffect, useState } from "react";
import { IconPlus, IconEdit, IconArchive, IconArchiveOff, IconX, IconTrash } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/procedimentos")({
  component: ProceduresPage,
});

type SessionType = "sessoes" | "avulso" | "especial" | "por_disparo";

type Proc = {
  id: string;
  name: string;
  duration_min: number | null;
  duration_min_2: number | null;
  price_single: number | null;
  price_5: number | null;
  price_10: number | null;
  price_20: number | null;
  active: boolean;
  requires_term: boolean | null;
  is_medical: boolean | null;
  term_text: string | null;
  resource_id: string | null;
  room_id: string | null;
  session_type: SessionType | null;
};

type Room = { id: string; name: string; purpose: string | null; active: boolean };
type Equipment = { id: string; name: string; active: boolean };

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
          Salas & Aparelhos
        </button>
      </div>
      {view === "procs" ? <ProceduresList /> : <RoomsEquipmentView />}
    </div>
  );
}

function ProceduresList() {
  const [rows, setRows] = useState<Proc[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");
  const [tableTab, setTableTab] = useState<"all" | "sessoes" | "avulso">("all");
  const [edit, setEdit] = useState<Proc | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: roomsData }] = await Promise.all([
      supabase.from("procedures").select("*").order("name"),
      supabase.from("rooms").select("*").eq("active", true).order("name"),
    ]);
    if (error) toast.error(error.message);
    setRows((data as Proc[]) ?? []);
    setRooms((roomsData as Room[]) ?? []);
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
    await supabase.from("settings").update({ bonus_proc_id: null }).eq("bonus_proc_id", p.id);
    const { error } = await supabase.from("procedures").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Procedimento excluído");
    load();
  };

  const visible = rows.filter((r) => {
    if (filter === "active" && !r.active) return false;
    if (filter === "inactive" && r.active) return false;
    const st = (r.session_type ?? "sessoes") as SessionType;
    if (tableTab === "sessoes" && st !== "sessoes") return false;
    if (tableTab === "avulso" && !(st === "avulso" || st === "especial" || st === "por_disparo")) return false;
    return true;
  });

  const fmtDur = (p: Proc) =>
    p.duration_min_2 && p.duration_min_2 !== p.duration_min
      ? `${p.duration_min}min / ${p.duration_min_2}min`
      : `${p.duration_min}min`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex bg-bg2 rounded-lg p-1 text-sm">
            {(["active", "inactive", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md font-semibold transition ${
                  filter === f ? "bg-navy text-white" : "text-text2 hover:text-navy"
                }`}
              >
                {f === "active" ? "Ativos" : f === "inactive" ? "Inativos" : "Todos"}
              </button>
            ))}
          </div>
          <div className="flex bg-bg2 rounded-lg p-1 text-sm">
            {([
              { key: "all", label: "Todos" },
              { key: "sessoes", label: "Tabela 1 (Sessões)" },
              { key: "avulso", label: "Tabela 2 (Avulso)" },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTableTab(t.key)}
                className={`px-3 py-1.5 rounded-md font-semibold transition ${
                  tableTab === t.key ? "bg-gold text-white" : "text-text2 hover:text-navy"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
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
        ) : tableTab === "sessoes" ? (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-left px-4 py-3 font-semibold">Duração</th>
                <th className="text-left px-4 py-3 font-semibold">Sala</th>
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
                  <td className="px-4 py-3 text-text2">{fmtDur(p)}</td>
                  <td className="px-4 py-3 text-text2 text-xs">
                    {rooms.find((r) => r.id === p.room_id)?.name ?? "—"}
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
                  <RowActions p={p} onEdit={setEdit} onToggle={toggleActive} onRemove={removeProc} />
                </tr>
              ))}
            </tbody>
          </table>
        ) : tableTab === "avulso" ? (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold">Duração</th>
                <th className="text-right px-4 py-3 font-semibold">Valor</th>
                <th className="text-left px-4 py-3 font-semibold">Observação</th>
                <th className="text-right px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p, i) => {
                const st = (p.session_type ?? "sessoes") as SessionType;
                return (
                  <tr key={p.id} className={i % 2 ? "bg-bg2/40" : ""}>
                    <td className="px-4 py-3 font-semibold text-navy">{p.name}</td>
                    <td className="px-4 py-3 text-text2 text-xs">{sessionTypeLabel(st)}</td>
                    <td className="px-4 py-3 text-text2">{fmtDur(p)}</td>
                    <td className="px-4 py-3 text-right text-text2">
                      {st === "por_disparo" ? "R$ 1,00 / disparo" : fmt(p.price_single)}
                    </td>
                    <td className="px-4 py-3 text-text2 text-xs">
                      {st === "especial" ? "Compra 2, faz 3" : st === "por_disparo" ? "Valor por disparo" : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`bh-badge ${p.active ? "bg-success/10 text-success" : "bg-text3/15 text-text3"}`}>
                        {p.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <RowActions p={p} onEdit={setEdit} onToggle={toggleActive} onRemove={removeProc} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold">Duração</th>
                <th className="text-right px-4 py-3 font-semibold">Preços</th>
                <th className="text-right px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p, i) => {
                const st = (p.session_type ?? "sessoes") as SessionType;
                return (
                  <tr key={p.id} className={i % 2 ? "bg-bg2/40" : ""}>
                    <td className="px-4 py-3 font-semibold text-navy">{p.name}</td>
                    <td className="px-4 py-3 text-text2 text-xs">{sessionTypeLabel(st)}</td>
                    <td className="px-4 py-3 text-text2">{fmtDur(p)}</td>
                    <td className="px-4 py-3 text-right text-text2 text-xs">
                      {st === "sessoes"
                        ? `${fmt(p.price_single)} / 5: ${fmt(p.price_5)} / 10: ${fmt(p.price_10)} / 20: ${fmt(p.price_20)}`
                        : st === "por_disparo"
                          ? "R$ 1,00 por disparo"
                          : st === "especial"
                            ? `${fmt(p.price_single)} · Compra 2, faz 3`
                            : fmt(p.price_single)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`bh-badge ${p.active ? "bg-success/10 text-success" : "bg-text3/15 text-text3"}`}>
                        {p.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <RowActions p={p} onEdit={setEdit} onToggle={toggleActive} onRemove={removeProc} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {(creating || edit) && (
        <ProcModal
          initial={edit}
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

function sessionTypeLabel(st: SessionType): string {
  if (st === "sessoes") return "Sessões";
  if (st === "avulso") return "Avulso";
  if (st === "especial") return "Especial";
  if (st === "por_disparo") return "Por disparo";
  return st;
}

function RowActions({
  p, onEdit, onToggle, onRemove,
}: {
  p: Proc;
  onEdit: (p: Proc) => void;
  onToggle: (p: Proc) => void;
  onRemove: (p: Proc) => void;
}) {
  return (
    <td className="px-4 py-3 text-right">
      <button type="button" onClick={() => onEdit(p)} className="p-1.5 rounded-md hover:bg-bg2 text-navy" title="Editar">
        <IconEdit size={16} />
      </button>
      <button type="button" onClick={() => onToggle(p)} className="p-1.5 rounded-md hover:bg-bg2 text-text2" title={p.active ? "Inativar" : "Reativar"}>
        {p.active ? <IconArchive size={16} /> : <IconArchiveOff size={16} />}
      </button>
      <button type="button" onClick={() => onRemove(p)} className="p-1.5 rounded-md hover:bg-danger/10 text-danger" title="Excluir">
        <IconTrash size={16} />
      </button>
    </td>
  );
}

function ProcModal({ initial, onClose, onSaved }: { initial: Proc | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [duration, setDuration] = useState(initial?.duration_min?.toString() ?? "60");
  const [duration2, setDuration2] = useState(initial?.duration_min_2?.toString() ?? "");
  const [single, setSingle] = useState(initial?.price_single?.toString() ?? "");
  const [p5, setP5] = useState(initial?.price_5?.toString() ?? "");
  const [p10, setP10] = useState(initial?.price_10?.toString() ?? "");
  const [p20, setP20] = useState(initial?.price_20?.toString() ?? "");
  const [requiresTerm, setRequiresTerm] = useState<boolean>(initial?.requires_term ?? false);
  const [isMedical, setIsMedical] = useState<boolean>(initial?.is_medical ?? false);
  const [termText, setTermText] = useState(initial?.term_text ?? "");
  const [roomId, setRoomId] = useState(initial?.room_id ?? "");
  const [sessionType, setSessionType] = useState<SessionType>((initial?.session_type as SessionType) ?? "sessoes");
  const [busy, setBusy] = useState(false);
  const [pros, setPros] = useState<{ id: string; name: string }[]>([]);
  const [selectedPros, setSelectedPros] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [{ data: prosData }, { data: roomsData }, { data: eqData }] = await Promise.all([
        supabase.from("app_users").select("id,name").eq("active", true).eq("role", "professional").order("name"),
        supabase.from("rooms").select("*").eq("active", true).order("name"),
        supabase.from("equipment").select("*").eq("active", true).order("name"),
      ]);
      setPros((prosData as { id: string; name: string }[]) ?? []);
      setRooms((roomsData as Room[]) ?? []);
      setEquipments((eqData as Equipment[]) ?? []);
      if (initial) {
        const [{ data: links }, { data: eqLinks }] = await Promise.all([
          supabase.from("procedure_professionals").select("professional_id").eq("procedure_id", initial.id),
          supabase.from("procedure_equipment").select("equipment_id").eq("procedure_id", initial.id),
        ]);
        setSelectedPros(new Set(((links as { professional_id: string }[]) ?? []).map((l) => l.professional_id)));
        setSelectedEquipment(new Set(((eqLinks as { equipment_id: string }[]) ?? []).map((l) => l.equipment_id)));
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

  const toggleEq = (id: string) => {
    setSelectedEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome obrigatório");
    const pwd = window.prompt("Digite a senha para salvar o procedimento:");
    // TODO SEGURANÇA: mover validação de admin_password para Edge Function/RPC com hash antes da entrega final
    const { data: pwdData } = await supabase.from("settings").select("admin_password").limit(1);
    const expected = (pwdData as Array<{ admin_password: string }> | null)?.[0]?.admin_password;
    if (!expected) { toast.error("Senha de admin não configurada"); return; }
    if (pwd !== expected) {
      toast.error("Senha incorreta. Acesso negado.");
      return;
    }
    setBusy(true);
    const payload = {
      name: name.trim(),
      duration_min: Number(duration) || 60,
      duration_min_2: duration2 ? Number(duration2) : null,
      price_single: single ? Number(single) : null,
      price_5: p5 ? Number(p5) : null,
      price_10: p10 ? Number(p10) : null,
      price_20: p20 ? Number(p20) : null,
      requires_term: requiresTerm,
      is_medical: isMedical,
      term_text: requiresTerm ? (termText.trim() || null) : null,
      room_id: roomId || null,
      session_type: sessionType,
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
    if (procId) {
      const pid = procId;
      await Promise.all([
        supabase.from("procedure_professionals").delete().eq("procedure_id", pid),
        supabase.from("procedure_equipment").delete().eq("procedure_id", pid),
      ]);
      const inserts: Promise<unknown>[] = [];
      if (selectedPros.size > 0) {
        inserts.push(supabase.from("procedure_professionals").insert(
          Array.from(selectedPros).map((proId) => ({ procedure_id: pid, professional_id: proId })),
        ));
      }
      if (selectedEquipment.size > 0) {
        inserts.push(supabase.from("procedure_equipment").insert(
          Array.from(selectedEquipment).map((eqId) => ({ procedure_id: pid, equipment_id: eqId })),
        ));
      }
      await Promise.all(inserts);
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
            <Field label="Tipo de tabela / cobrança">
              <select value={sessionType} onChange={(e) => setSessionType(e.target.value as SessionType)} className={inp}>
                <option value="sessoes">Tabela 1 — Sessões (5/10/20)</option>
                <option value="avulso">Tabela 2 — Avulso (valor único)</option>
                <option value="especial">Especial — Compra 2, faz 3</option>
                <option value="por_disparo">Por disparo (R$ 1,00)</option>
              </select>
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Duração (min)*">
              <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className={inp} required />
            </Field>
            <Field label="Duração alternativa (min) — opcional">
              <input type="number" value={duration2} onChange={(e) => setDuration2(e.target.value)} className={inp} placeholder="Ex.: 90" />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Preço avulso (R$)"><input type="number" step="0.01" value={single} onChange={(e) => setSingle(e.target.value)} className={inp} /></Field>
            <Field label="Pacote 5x (R$)"><input type="number" step="0.01" value={p5} onChange={(e) => setP5(e.target.value)} className={inp} /></Field>
          </FieldRow>
          <FieldRow>
            <Field label="Pacote 10x (R$)"><input type="number" step="0.01" value={p10} onChange={(e) => setP10(e.target.value)} className={inp} /></Field>
            <Field label="Pacote 20x (R$)"><input type="number" step="0.01" value={p20} onChange={(e) => setP20(e.target.value)} className={inp} /></Field>
          </FieldRow>

          {/* Sala vinculada */}
          <Field label="Sala vinculada (opcional)">
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={inp}>
              <option value="">— Nenhuma —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.purpose ? ` — ${r.purpose}` : ""}</option>
              ))}
            </select>
          </Field>

          {/* Aparelhos utilizados */}
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">
              Aparelhos utilizados (opcional)
            </label>
            {equipments.length === 0 ? (
              <div className="text-xs text-text3">Nenhum aparelho cadastrado. Cadastre em Salas & Aparelhos.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2 bg-bg2/40 rounded-lg border border-border">
                {equipments.map((eq) => (
                  <label key={eq.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-bg2 px-2 py-1 rounded">
                    <input type="checkbox" checked={selectedEquipment.has(eq.id)} onChange={() => toggleEq(eq.id)} />
                    {eq.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Profissionais habilitadas */}
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
              Exige termo de consentimento (assinado em cada sessão)
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
            <label className="flex items-center gap-2 text-sm font-semibold text-navy">
              <input type="checkbox" checked={isMedical} onChange={(e) => setIsMedical(e.target.checked)} />
              <span>Exige prontuário médico assinado (médico + paciente)</span>
            </label>
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

// ──────────────────────────────────────────────────
// Salas & Aparelhos view
// ──────────────────────────────────────────────────

function RoomsEquipmentView() {
  const [subTab, setSubTab] = useState<"salas" | "aparelhos">("salas");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border/60">
        <button
          type="button"
          onClick={() => setSubTab("salas")}
          className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${subTab === "salas" ? "border-gold text-navy" : "border-transparent text-text2 hover:text-navy"}`}
        >
          Salas
        </button>
        <button
          type="button"
          onClick={() => setSubTab("aparelhos")}
          className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${subTab === "aparelhos" ? "border-gold text-navy" : "border-transparent text-text2 hover:text-navy"}`}
        >
          Aparelhos
        </button>
      </div>
      {subTab === "salas" ? <RoomsList /> : <EquipmentList />}
    </div>
  );
}

function RoomsList() {
  const [rows, setRows] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("rooms").select("*").order("name");
    if (error) toast.error(error.message);
    setRows((data as Room[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (r: Room) => {
    const { error } = await supabase.from("rooms").update({ active: !r.active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(r.active ? "Inativada" : "Reativada");
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
          <IconPlus size={18} /> Nova sala
        </button>
      </div>
      <div className="bh-card overflow-x-auto">
        {loading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-text3">Nenhuma sala cadastrada.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-left px-4 py-3 font-semibold">Finalidade</th>
                <th className="text-right px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={i % 2 ? "bg-bg2/40" : ""}>
                  <td className="px-4 py-3 font-semibold text-navy">{r.name}</td>
                  <td className="px-4 py-3 text-text2 text-xs">{r.purpose ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`bh-badge ${r.active ? "bg-success/10 text-success" : "bg-text3/15 text-text3"}`}>
                      {r.active ? "Ativa" : "Inativa"}
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
        <RoomModal
          initial={edit}
          onClose={() => { setEdit(null); setCreating(false); }}
          onSaved={() => { setEdit(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function RoomModal({ initial, onClose, onSaved }: { initial: Room | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome obrigatório");
    setBusy(true);
    const payload = { name: name.trim(), purpose: purpose.trim() || null };
    const { error } = initial
      ? await supabase.from("rooms").update(payload).eq("id", initial.id)
      : await supabase.from("rooms").insert({ ...payload, active: true });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(initial ? "Atualizada!" : "Criada!");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">{initial ? "Editar sala" : "Nova sala"}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <Field label="Nome*">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inp} required placeholder="Ex.: Sala 1 — Laser" />
          </Field>
          <Field label="Finalidade (opcional)">
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inp} placeholder="Ex.: Estética facial, Depilação" />
          </Field>
          <div className="text-xs text-text3">Uma sala comporta 1 atendimento por vez. Ao vincular um procedimento a uma sala, a agenda impedirá sobreposição de horários nessa sala.</div>
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

function EquipmentList() {
  const [rows, setRows] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Equipment | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("equipment").select("*").order("name");
    if (error) toast.error(error.message);
    setRows((data as Equipment[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (eq: Equipment) => {
    const { error } = await supabase.from("equipment").update({ active: !eq.active }).eq("id", eq.id);
    if (error) return toast.error(error.message);
    toast.success(eq.active ? "Inativado" : "Reativado");
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
          <IconPlus size={18} /> Novo aparelho
        </button>
      </div>
      <div className="bh-card overflow-x-auto">
        {loading ? (
          <TableSkeleton rows={3} cols={3} />
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-text3">Nenhum aparelho cadastrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-right px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((eq, i) => (
                <tr key={eq.id} className={i % 2 ? "bg-bg2/40" : ""}>
                  <td className="px-4 py-3 font-semibold text-navy">{eq.name}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`bh-badge ${eq.active ? "bg-success/10 text-success" : "bg-text3/15 text-text3"}`}>
                      {eq.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setEdit(eq)} className="p-1.5 rounded-md hover:bg-bg2 text-navy"><IconEdit size={16} /></button>
                    <button type="button" onClick={() => toggleActive(eq)} className="p-1.5 rounded-md hover:bg-bg2 text-text2">
                      {eq.active ? <IconArchive size={16} /> : <IconArchiveOff size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(creating || edit) && (
        <EquipmentModal
          initial={edit}
          onClose={() => { setEdit(null); setCreating(false); }}
          onSaved={() => { setEdit(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function EquipmentModal({ initial, onClose, onSaved }: { initial: Equipment | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome obrigatório");
    setBusy(true);
    const { error } = initial
      ? await supabase.from("equipment").update({ name: name.trim() }).eq("id", initial.id)
      : await supabase.from("equipment").insert({ name: name.trim(), active: true });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(initial ? "Atualizado!" : "Criado!");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-sm my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">{initial ? "Editar aparelho" : "Novo aparelho"}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2 text-text2"><IconX size={18} /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <Field label="Nome*">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inp} required placeholder="Ex.: Laser Lavieen, Criofrequência" />
          </Field>
          <div className="text-xs text-text3">Ao vincular um aparelho a procedimentos, a agenda impedirá uso simultâneo em horários sobrepostos.</div>
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
