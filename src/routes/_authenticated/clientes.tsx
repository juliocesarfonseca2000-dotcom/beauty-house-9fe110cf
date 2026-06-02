import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconSearch, IconPlus, IconBrandWhatsapp, IconUserOff, IconUserCheck, IconCamera } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ClientFormModal } from "@/components/clients/ClientFormModal";
import { ScanClientCardModal } from "@/components/clients/ScanClientCardModal";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientsPage,
});

type Row = {
  id: string;
  record_num: number;
  name: string;
  phone: string | null;
  active: boolean;
  created_at: string;
};

function ClientsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [openScan, setOpenScan] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    let query = supabase.from("clients").select("id,record_num,name,phone,active,created_at").order("name");
    if (filter === "active") query = query.eq("active", true);
    if (filter === "inactive") query = query.eq("active", false);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const filtered = rows.filter(
    (r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.phone ?? "").includes(q)
  );

  const toggleActive = async (r: Row) => {
    const verb = r.active ? "Inativar" : "Reativar";
    if (!confirm(`${verb} ${r.name}?`)) return;
    const { error } = await supabase.from("clients").update({ active: !r.active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(`Cliente ${r.active ? "inativada" : "reativada"}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
        </div>
        <div className="flex bg-bg2 rounded-lg p-1 text-sm">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md font-semibold capitalize transition ${
                filter === f ? "bg-navy text-white" : "text-text2 hover:text-navy"
              }`}
            >
              {f === "all" ? "Todas" : f === "active" ? "Ativas" : "Inativas"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpenNew(true)}
          className="px-4 py-2.5 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center gap-2"
        >
          <IconPlus size={18} /> Nova cliente
        </button>
      </div>

      <div className="bh-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-text3">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="font-display text-xl text-navy mb-1">Nenhuma cliente</div>
            <div className="text-text3 text-sm">Cadastre a primeira clicando em "Nova cliente"</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Ficha</th>
                <th className="text-left px-5 py-3 font-semibold">Nome</th>
                <th className="text-left px-5 py-3 font-semibold">Telefone</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-right px-5 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} className={i % 2 ? "bg-bg2/40" : ""}>
                  <td className="px-5 py-3 font-mono text-text2">#{r.record_num}</td>
                  <td className="px-5 py-3">
                    <Link to="/clientes/$id" params={{ id: r.id }} className="font-semibold text-navy hover:text-gold">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-text2">{r.phone ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`bh-badge ${r.active ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                      {r.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {r.phone && (
                        <a
                          href={`https://wa.me/${r.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-md hover:bg-success/10 text-success"
                          title="WhatsApp"
                        >
                          <IconBrandWhatsapp size={16} />
                        </a>
                      )}
                      <button
                        onClick={() => toggleActive(r)}
                        className="p-1.5 rounded-md hover:bg-bg2 text-text2"
                        title={r.active ? "Inativar" : "Reativar"}
                      >
                        {r.active ? <IconUserOff size={16} /> : <IconUserCheck size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openNew && (
        <ClientFormModal
          onClose={() => setOpenNew(false)}
          onCreated={(id) => {
            setOpenNew(false);
            load();
            navigate({ to: "/clientes/$id", params: { id } });
          }}
        />
      )}
    </div>
  );
}
