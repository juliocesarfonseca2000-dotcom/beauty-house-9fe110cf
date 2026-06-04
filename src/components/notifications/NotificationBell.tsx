// Sino de notificações — lê tabela `notifications`, mostra contador e lista.
// Atualiza via Supabase Realtime (já configurado em useRealtimeSync).
import { useEffect, useState } from "react";
import { IconBell, IconCheck, IconX } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  appointment_id: string | null;
  target_roles: string[];
  is_read: boolean;
  created_at: string;
};

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as Notif[]) ?? [];
    },
    refetchInterval: 60_000,
  });

  // filtra pelo role do usuário
  const visible = items.filter((n) =>
    !user?.role ? false : n.target_roles.includes(user.role),
  );

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  // Heurística simples: ao montar, gera notificações para agendamentos que
  // passaram +30min do término sem confirmação. Roda só p/ admin/recepção.
  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin" && user.role !== "receptionist") return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 12 * 60 * 60_000).toISOString();
      const { data: appts } = await supabase
        .from("appointments")
        .select("id,datetime,duration_min,status,clients(name),procedures(name),app_users:professional_id(name)")
        .gte("datetime", since)
        .neq("status", "done")
        .neq("status", "cancelled")
        .neq("status", "missed");
      if (cancelled || !appts) return;
      const now = Date.now();
      type ApptRow = {
        id: string; datetime: string; duration_min: number | null;
        clients: { name: string } | { name: string }[] | null;
        procedures: { name: string } | { name: string }[] | null;
        app_users: { name: string } | { name: string }[] | null;
      };
      const candidates = (appts as unknown as ApptRow[]).filter((a) => {
        const end = new Date(a.datetime).getTime() + (a.duration_min ?? 60) * 60_000;
        return end + 30 * 60_000 < now;
      });
      if (!candidates.length) return;
      // Verifica quais já têm notif (evita duplicar)
      const { data: existing } = await supabase
        .from("notifications")
        .select("appointment_id")
        .in("appointment_id", candidates.map((c) => c.id));
      const seen = new Set(((existing ?? []) as Array<{ appointment_id: string | null }>).map((e) => e.appointment_id));
      const toInsert = candidates.filter((c) => !seen.has(c.id)).map((c) => {
        const cliName = Array.isArray(c.clients) ? c.clients[0]?.name : c.clients?.name;
        const procName = Array.isArray(c.procedures) ? c.procedures[0]?.name : c.procedures?.name;
        const proName = Array.isArray(c.app_users) ? c.app_users[0]?.name : c.app_users?.name;
        const hh = new Date(c.datetime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return {
          type: "appointment_unconfirmed",
          target_roles: ["admin", "receptionist"],
          title: "Sessão sem confirmação",
          body: `⚠️ ${cliName ?? "Cliente"} — ${procName ?? "Procedimento"} com ${proName ?? "profissional"} às ${hh} não foi confirmada.`,
          action_url: `/agenda`,
          appointment_id: c.id,
        };
      });
      if (toInsert.length) {
        await supabase.from("notifications").insert(toInsert);
        qc.invalidateQueries({ queryKey: ["notifications"] });
      }
    })();
    return () => { cancelled = true; };
  }, [user, qc]);

  const count = visible.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md hover:bg-bg2 text-text2"
        title="Notificações"
      >
        <IconBell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-80 max-h-[70vh] overflow-y-auto bh-card z-40 shadow-xl">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="font-semibold text-navy text-sm">Notificações</div>
              <button onClick={() => setOpen(false)} className="p-1 text-text3 hover:text-navy"><IconX size={14} /></button>
            </div>
            {visible.length === 0 ? (
              <div className="p-6 text-center text-text3 text-sm">Nenhuma notificação.</div>
            ) : (
              visible.map((n) => (
                <div key={n.id} className="p-3 border-b border-border last:border-0">
                  <div className="text-sm font-semibold text-navy">{n.title}</div>
                  <div className="text-xs text-text2 mt-1">{n.body}</div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-[10px] text-text3">{new Date(n.created_at).toLocaleString("pt-BR")}</div>
                    <div className="flex gap-1">
                      {n.action_url && (
                        <a
                          href={n.action_url}
                          onClick={() => { markRead(n.id); setOpen(false); }}
                          className="px-2 py-0.5 rounded text-[11px] bg-navy text-white hover:bg-navy2"
                        >
                          Abrir
                        </a>
                      )}
                      <button
                        onClick={() => { markRead(n.id); toast.success("Marcada como lida"); }}
                        className="px-2 py-0.5 rounded text-[11px] border border-border text-text2 hover:bg-bg2 flex items-center gap-1"
                      >
                        <IconCheck size={11} /> Ok
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
