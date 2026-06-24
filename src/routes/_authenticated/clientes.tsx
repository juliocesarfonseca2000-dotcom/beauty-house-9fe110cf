import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { IconSearch, IconPlus, IconBrandWhatsapp, IconUserOff, IconUserCheck, IconCamera, IconTrash, IconDownload } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
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
  cpf: string | null;
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
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "receptionist" || user?.is_evaluator === true;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["clients", filter, q, user?.role, user?.id],
    queryFn: async () => {
      const term = q.trim();
      let query = supabase.from("clients").select("id,record_num,name,phone,cpf,active,created_at");
      if (term) {
        const hasCpfFormat = /[.\-/]/.test(term);
        const isNumericOnly = /^\d+$/.test(term);
        if (hasCpfFormat) {
          query = query.ilike("cpf", `%${term}%`);
        } else if (isNumericOnly) {
          query = query.or(`record_num.eq.${parseInt(term, 10)},phone.ilike.%${term}%`);
        } else {
          query = query.ilike("name", `%${term}%`);
        }
      }
      if (filter === "active") query = query.eq("active", true);
      if (filter === "inactive") query = query.eq("active", false);
      query = query.limit(50);
      query = query.order("name");
      const { data, error } = await withTimeout(query, 10000, "Carregamento de clientes");
      if (error) throw error;
      return (data as Row[]) ?? [];
    },
    staleTime: 60_000,
  });

  const filtered = q.trim()
    ? rows.filter((r) => {
        const term = q.trim().toLowerCase();
        return (
          r.name.toLowerCase().includes(term) ||
          (r.phone ?? "").includes(term) ||
          (r.cpf ?? "").includes(term) ||
          String(r.record_num).includes(term)
        );
      })
    : rows;


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

  const deleteMutation = useMutation({
    mutationFn: async (r: Row) => {
      const [{ data: photos }, { data: sessions }] = await Promise.all([
        withTimeout(supabase.from("client_photos").select("url").eq("client_id", r.id), 10000, "Busca das fotos da cliente"),
        withTimeout(supabase.from("sessions").select("id").eq("client_id", r.id), 10000, "Busca das sessões da cliente"),
      ]);
      const photoPaths = ((photos as Array<{ url: string }> | null) ?? [])
        .map((p) => p.url.split("/client-photos/")[1])
        .filter(Boolean);
      const signaturePaths = ((sessions as Array<{ id: string }> | null) ?? []).map((s) => `${r.id}/${s.id}.png`);
      if (photoPaths.length) await supabase.storage.from("client-photos").remove(photoPaths);
      if (signaturePaths.length) await supabase.storage.from("signatures").remove(signaturePaths);
      await withTimeout(supabase.from("income").delete().eq("client_id", r.id), 12000, "Exclusão do financeiro da cliente");
      await withTimeout(supabase.from("clients").update({ referral_client_id: null }).eq("referral_client_id", r.id), 12000, "Ajuste de indicações");
      const { data: pkgs } = await supabase.from("packages").select("id").eq("client_id", r.id);
      if (pkgs?.length) {
        const pkgIds = (pkgs as Array<{ id: string }>).map((p) => p.id);
        await supabase.from("sessions").delete().in("package_id", pkgIds);
      }
      await supabase.from("appointments").delete().eq("client_id", r.id);
      await supabase.from("packages").delete().eq("client_id", r.id);
      const { error } = await withTimeout(
        supabase.from("clients").delete().eq("id", r.id),
        12000,
        "Exclusão da cliente",
      );
      if (error) throw error;
      return r;
    },
    onSuccess: (r) => {
      toast.success(`Cliente ${r.name} removida com sucesso`);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.removeQueries({ queryKey: ["client", r.id] });
    },
    onError: (e: Error) => {
      const msg = e.message.toLowerCase().includes("foreign key")
        ? "Não foi possível excluir porque existe histórico ligado a esta cliente. Use inativar para preservar os registros."
        : e.message;
      toast.error(msg);
    },
  });

  const toggleActive = (r: Row) => {
    const verb = r.active ? "Inativar" : "Reativar";
    if (!confirm(`${verb} ${r.name}?`)) return;
    toggleMutation.mutate(r);
  };

  const deleteClient = (r: Row) => {
    if (!confirm(`Excluir definitivamente ${r.name}? Esta ação não pode ser desfeita.`)) return;
    deleteMutation.mutate(r);
  };

  const prefetchClient = (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ["client", id],
      queryFn: async () => {
        const { data, error } = await withTimeout(
          supabase.from("clients").select("*").eq("id", id).maybeSingle(),
          10000,
          "Pré-carregamento da ficha",
        );
        if (error) throw error;
        return data;
      },
    });
  };

  const openClient = (id: string) => {
    navigate({ to: "/ficha", search: { cliente: id } });
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["clients"] });

  const exportCsv = () => {
    if (filtered.length === 0) return toast.error("Nenhuma cliente para exportar");
    const esc = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Ficha", "Nome", "Telefone", "Status", "Cadastro"];
    const lines = [header.join(";")].concat(
      filtered.map((r) => [
        r.record_num,
        r.name,
        r.phone ?? "",
        r.active ? "Ativa" : "Inativa",
        new Date(r.created_at).toLocaleDateString("pt-BR"),
      ].map(esc).join(";"))
    );
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} cliente(s) exportada(s)`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, nº ficha, telefone ou CPF..."
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
          type="button"
          onClick={exportCsv}
          className="px-4 py-2.5 rounded-lg border border-border text-text2 font-semibold hover:bg-bg2 flex items-center gap-2"
          title="Exportar CSV"
        >
          <IconDownload size={18} /> Exportar
        </button>
        {canEdit && (
          <button
            onClick={() => setOpenScan(true)}
            className="px-4 py-2.5 rounded-lg border-2 border-gold text-gold font-semibold hover:bg-gold/10 flex items-center gap-2"
          >
            <IconCamera size={18} /> Escanear ficha
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => setOpenNew(true)}
            className="px-4 py-2.5 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 flex items-center gap-2"
          >
            <IconPlus size={18} /> Nova cliente
          </button>
        )}
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
                <tr
                  key={r.id}
                  onClick={() => openClient(r.id)}
                  onMouseEnter={() => prefetchClient(r.id)}
                  className={`${i % 2 ? "bg-bg2/40" : ""} cursor-pointer hover:bg-gold/5`}
                >
                  <td className="px-5 py-3 font-mono text-text2">#{r.record_num}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to="/ficha"
                        search={{ cliente: r.id }}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-navy hover:text-gold"
                      >
                        {r.name}
                      </Link>
                      {r.record_num != null && (
                        <span className="bh-badge bg-text3/15 text-text2 font-mono text-[11px]">
                          #{r.record_num}
                        </span>
                      )}
                    </div>
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
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-md hover:bg-success/10 text-success"
                          title="WhatsApp"
                        >
                          <IconBrandWhatsapp size={16} />
                        </a>
                      )}
                      {canEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleActive(r); }}
                          className="p-1.5 rounded-md hover:bg-bg2 text-text2"
                          title={r.active ? "Inativar" : "Reativar"}
                        >
                          {r.active ? <IconUserOff size={16} /> : <IconUserCheck size={16} />}
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteClient(r); }}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 rounded-md hover:bg-danger/10 text-danger disabled:opacity-40"
                          title="Excluir cliente"
                        >
                          <IconTrash size={16} />
                        </button>
                      )}
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
            navigate({ to: "/ficha", search: { cliente: id } });
          }}
        />
      )}

      {openScan && (
        <ScanClientCardModal
          onClose={() => setOpenScan(false)}
          onCreated={(id) => {
            setOpenScan(false);
            invalidate();
            navigate({ to: "/ficha", search: { cliente: id } });
          }}
        />
      )}
    </div>
  );
}
