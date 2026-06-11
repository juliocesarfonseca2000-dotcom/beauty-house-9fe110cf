import { useEffect, useState } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Absence = {
  id: string;
  user_id: string;
  type: "vacation" | "absent" | "dayoff" | "leave";
  date_start: string;
  date_end: string;
  note: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<Absence["type"], { label: string; cls: string }> = {
  vacation: { label: "Férias", cls: "bg-blue-500/15 text-blue-600" },
  absent:   { label: "Falta",  cls: "bg-red-500/15 text-red-600"  },
  dayoff:   { label: "Folga",  cls: "bg-green-500/15 text-green-700" },
  leave:    { label: "Licença",cls: "bg-purple-500/15 text-purple-700" },
};

export function AbsencesTab({ userId }: { userId: string }) {
  const { user: me } = useAuth();
  const [rows, setRows]         = useState<Absence[]>([]);
  const [loading, setLoading]   = useState(true);
  const [type, setType]         = useState<Absence["type"]>("dayoff");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd]   = useState("");
  const [note, setNote]         = useState("");
  const [busy, setBusy]         = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("staff_absences")
      .select("*")
      .eq("user_id", userId)
      .order("date_start", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as Absence[]) ?? []);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const handleAdd = async () => {
    if (!dateStart || !dateEnd) return toast.error("Informe as datas");
    if (dateEnd < dateStart)    return toast.error("Data final inválida");
    setBusy(true);
    const { error } = await supabase.from("staff_absences").insert({
      user_id: userId,
      type,
      date_start: dateStart,
      date_end:   dateEnd,
      note:       note || null,
      created_by: me?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Adicionado com sucesso!");
    setDateStart(""); setDateEnd(""); setNote("");
    load();
  };

  const del = async (id: string) => {
    if (!window.confirm("Excluir este registro?")) return;
    const { error } = await supabase.from("staff_absences").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    load();
  };

  const toggleOne = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Excluir ${selected.size} registro(s) selecionado(s)?`)) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("staff_absences").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} registro(s) excluído(s)`);
    setSelectMode(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="bh-card p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-text2 uppercase mb-1">Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value as Absence["type"])} className={inp}>
            <option value="dayoff">Folga</option>
            <option value="vacation">Férias</option>
            <option value="absent">Falta</option>
            <option value="leave">Licença</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-text2 uppercase mb-1">De</label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className={inp}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text2 uppercase mb-1">Até</label>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className={inp}
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-xs font-semibold text-text2 uppercase mb-1">Observação</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inp}
            placeholder="Opcional"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 flex items-center gap-2 justify-center disabled:opacity-50"
        >
          <IconPlus size={16} /> Adicionar
        </button>
      </div>

      <div className="bh-card overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-text3 text-sm">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-text3 text-sm">Nenhum registro cadastrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Tipo</th>
                <th className="text-left px-4 py-2 font-semibold">Período</th>
                <th className="text-left px-4 py-2 font-semibold">Observação</th>
                <th className="text-right px-4 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={a.id} className={i % 2 ? "bg-bg2/40" : ""}>
                  <td className="px-4 py-2">
                    <span className={`bh-badge ${TYPE_LABELS[a.type].cls}`}>
                      {TYPE_LABELS[a.type].label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-text2">
                    {new Date(a.date_start + "T00:00").toLocaleDateString("pt-BR")}
                    {" → "}
                    {new Date(a.date_end + "T00:00").toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2 text-text2">{a.note ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => del(a.id)}
                      className="p-1.5 rounded-md hover:bg-red-100 text-red-500"
                      title="Excluir"
                    >
                      <IconTrash size={16} />
                    </button>
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

const inp = "w-full px-3 py-2 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-gold/40 text-sm";
