import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconTrash, IconArrowRight, IconChecks } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  component: NotificationsPage,
});

type Notif = {
  id: string; type: string; title: string; body: string;
  action_url: string | null; appointment_id: string | null; client_id: string | null;
  deep_tab: string | null; target_roles: string[]; is_read: boolean; created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  package_low: "Pacote",
  client_inactive_30: "Cliente sumindo",
  client_inactive_60: "Cliente sumindo",
  appointment_unconfirmed: "Sessão",
};

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "package" | "inactive" | "session">("all");

  const canSee = user?.role === "admin" || user?.role === "receptionist";

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications-all"],
    enabled: !!canSee,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .or(`user_id.is.null,user_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(500);
      return ((data as Notif[]) ?? []).filter((n) => !user?.role ? false : n.target_roles.includes(user.role!));
    },
  });

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (filter === "all") return true;
      if (filter === "package") return n.type === "package_low";
      if (filter === "inactive") return n.type === "client_inactive_30" || n.type === "client_inactive_60";
      if (filter === "session") return n.type === "appointment_unconfirmed";
      return true;
    });
  }, [items, filter]);

  if (!canSee) return <div className="bh-card p-12 text-center text-text3">Sem permissão.</div>;

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const clearRead = async () => {
    await supabase.from("notifications").delete().eq("is_read", true).or(`user_id.eq.${user!.id},user_id.is.null`);
    toast.success("Notificações lidas removidas");
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
  };
  const markAllRead = async () => {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id);
    if (!ids.length) {
      toast.info("Nenhuma notificação não lida");
      return;
    }
    const { error } = await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    if (error) {
      toast.error("Erro ao marcar como lidas");
      return;
    }
    toast.success("Todas marcadas como lidas");
    await qc.invalidateQueries({ queryKey: ["notifications-all"] });
    await qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const goTo = async (n: Notif) => {
    if (!n.is_read) await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    if (n.client_id) {
      navigate({ to: "/clientes/$id", params: { id: n.client_id }, search: { tab: n.deep_tab || "sessoes" } });
    } else if (n.action_url) {
      navigate({ to: n.action_url });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {([
            ["all", "Todas"],
            ["package", "Pacotes"],
            ["inactive", "Clientes sumindo"],
            ["session", "Sessões"],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filter === k ? "bg-navy text-white border-navy" : "border-border text-text2 hover:bg-bg2"}`}
            >{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={markAllRead} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-text2 hover:bg-bg2 flex items-center gap-1">
            <IconChecks size={14} /> Marcar todas como lidas
          </button>
          <button onClick={clearRead} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-text2 hover:bg-bg2 flex items-center gap-1">
            <IconChecks size={14} /> Limpar todas lidas
          </button>
        </div>

      </div>

      <div className="bh-card overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-text3 text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-text3 text-sm">Nenhuma notificação.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Quando</th>
                <th className="text-left px-3 py-2 font-semibold">Tipo</th>
                <th className="text-left px-3 py-2 font-semibold">Descrição</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="text-right px-3 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((n, i) => (
                <tr key={n.id} className={i % 2 ? "bg-bg2/40" : ""}>
                  <td className="px-3 py-2 text-text3 whitespace-nowrap">{new Date(n.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2"><span className="bh-badge bg-navy/10 text-navy">{TYPE_LABEL[n.type] ?? n.type}</span></td>
                  <td className="px-3 py-2"><div className="font-semibold text-navy">{n.title}</div><div className="text-xs text-text2">{n.body}</div></td>
                  <td className="px-3 py-2">
                    {n.is_read
                      ? <span className="bh-badge bg-text3/10 text-text3">Lida</span>
                      : <span className="bh-badge bg-gold/15 text-gold">Não lida</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => goTo(n)} className="p-1.5 rounded hover:bg-bg2 text-navy" title="Ir para ficha"><IconArrowRight size={15} /></button>
                    <button onClick={() => remove(n.id)} className="p-1.5 rounded hover:bg-bg2 text-danger" title="Excluir"><IconTrash size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Link to="/" className="text-text2 hover:text-navy text-sm">← Voltar</Link>
    </div>
  );
}
