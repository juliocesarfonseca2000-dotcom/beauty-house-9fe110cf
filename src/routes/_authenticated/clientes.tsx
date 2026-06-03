import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { IconSearch, IconPlus, IconBrandWhatsapp, IconUserOff, IconUserCheck, IconCamera } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ClientFormModal } from "@/components/clients/ClientFormModal";
import { ScanClientCardModal } from "@/components/clients/ScanClientCardModal";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { withTimeout } from "@/lib/with-timeout";

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

function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://web.whatsapp.com/send?phone=${withCountry}`;
}

function ClientsPage() {
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [openScan, setOpenScan] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["clients", filter],
    queryFn: async () => {
      let query = supabase.from("clients").select("id,record_num,name,phone,active,created_at").order("name");
      if (filter === "active") query = query.eq("active", true);
      if (filter === "inactive") query = query.eq("active", false);
      const { data, error } = await withTimeout(query, 10000, "Carregamento de clientes");
      if (error) throw error;
      return (data as Row[]) ?? [];
    },
  });

  const filtered = rows.filter(
    (r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || (r.phone ?? "").includes(q)
  );

  const toggleMutation = useMutation({
    mutationFn: async (r: Row) => {
      const { error } = await withTimeout(supabase.from("clients").update({ active: !r.active }).eq("id", r.id), 10000, "Atualização da cliente");
      if (error) throw error;
      return r;
    },
    onSuccess: (r) => {
      toast.success(`Cliente ${r.active ? "inativada" : "reativada"}`);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = (r: Row) => {
    const verb = r.active ? "Inativar" : "Reativar";
    if (!confirm(`${verb} ${r.name}?`)) return;
    toggleMutation.mutate(r);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["clients"] });

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
          onClick={() => setOpenScan(true)}
          className="px-4 py-2.5 rounded-lg border-2 border-gold text-gold font-semibold hover:bg-gold/10 flex items-center gap-2"
        >
          <IconCamera size={18} /> Escanear ficha
        </button>
        <button
          onClick={() => setOpenNew(true)}
          className="px-4 py-2.5 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center gap-2"
        >
          <IconPlus size={18} /> Nova cliente
        </button>
      </div>

      <div className="bh-card overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} cols={5} />
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
                          href={whatsappUrl(r.phone)}
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
            invalidate();
            navigate({ to: "/clientes/$id", params: { id } });
          }}
        />
      )}

      {openScan && (
        <ScanClientCardModal
          onClose={() => setOpenScan(false)}
          onCreated={(id) => {
            setOpenScan(false);
            invalidate();
            navigate({ to: "/clientes/$id", params: { id } });
          }}
        />
      )}
    </div>
  );
}
