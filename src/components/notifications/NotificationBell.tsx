// Sino de notificações consolidado.
// Tipos: package_low, client_inactive_30, client_inactive_60, appointment_unconfirmed, client_arrived
// Visível para admin, receptionist e professional (client_arrived).
import { useEffect, useMemo, useRef, useState } from "react";
import { IconBell, IconX, IconTrash, IconChecks } from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
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
  client_id: string | null;
  deep_tab: string | null;
  target_roles: string[];
  user_id: string | null;
  is_read: boolean;
  created_at: string;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [avulsoSkipped, setAvulsoSkipped] = useState<{ count: number; names: string[] }>({ count: 0, names: [] });

  const canSee = user?.role === "admin" || user?.role === "receptionist";
  const ranRef = useRef(false);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from("notifications")
        .select("id,type,title,body,action_url,appointment_id,client_id,deep_tab,target_roles,user_id,is_read,created_at")
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (user.role === "professional") {
        query = query.eq("user_id", user.id);
      } else {
        query = query.or(`user_id.is.null,user_id.eq.${user.id}`);
      }
      const { data } = await query;
      return (data as Notif[]) ?? [];
    },
    refetchInterval: 5_000,
  });

  const visible = useMemo(
    () => items.filter((n) => {
      if (!user?.role) return false;
      if (user.role === "professional") return n.user_id === user.id;
      return n.target_roles.includes(user.role);
    }),
    [items, user?.role, user?.id],
  );

  // Geração automática de alertas (só admin/recepção) — roda uma vez por montagem
  useEffect(() => {
    if (!canSee || ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;
    (async () => {
      const [low] = await Promise.all([genLowPackages(), genInactiveClients(), genUnconfirmed(user)]);
      if (cancelled) return;
      setAvulsoSkipped(low);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSee]);

  if (!user) return null;

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const markAllRead = async () => {
    const ids = visible.filter((n) => !n.is_read).map((n) => n.id);
    if (!ids.length) return;
    const { error } = await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    if (error) {
      toast.error("Erro ao marcar como lidas");
      return;
    }
    toast.success("Todas marcadas como lidas");
    await qc.invalidateQueries({ queryKey: ["notifications"] });
    await qc.invalidateQueries({ queryKey: ["notifications-all"] });
  };

  const openNotif = async (n: Notif) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
    setOpen(false);
    if (n.client_id) {
      navigate({ to: "/clientes/$id", params: { id: n.client_id }, search: { tab: n.deep_tab || "sessoes" } });
    } else if (n.action_url) {
      navigate({ to: n.action_url });
    }
  };

  const count = visible.length;

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative p-2 rounded-md hover:bg-bg2 text-text2" title="Notificações">
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
          <div className="absolute right-0 top-full mt-1 w-96 max-h-[75vh] overflow-y-auto bh-card z-40 shadow-xl">
            <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 bg-card">
              <div className="font-semibold text-navy text-sm">Notificações</div>
              <div className="flex items-center gap-1">
                {visible.length > 0 && (
                  <button onClick={markAllRead} className="text-[11px] text-text2 hover:text-navy flex items-center gap-1 px-2 py-1 rounded hover:bg-bg2">
                    <IconChecks size={12} /> Marcar todas
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 text-text3 hover:text-navy"><IconX size={14} /></button>
              </div>
            </div>
            {visible.length === 0 ? (
              <div className="p-8 text-center text-text3 text-sm">Nenhum alerta no momento 🎉</div>
            ) : (
              visible.map((n) => (
                <div key={n.id} className="p-3 border-b border-border last:border-0 hover:bg-bg2/40 flex gap-2">
                  <button onClick={() => openNotif(n)} className="flex-1 text-left">
                    <div className="text-sm font-semibold text-navy">{n.title}</div>
                    <div className="text-xs text-text2 mt-0.5">{n.body}</div>
                    <div className="text-[10px] text-text3 mt-1">{timeAgo(n.created_at)}</div>
                  </button>
                  <button onClick={() => remove(n.id)} className="p-1 text-text3 hover:text-danger self-start" title="Excluir">
                    <IconTrash size={14} />
                  </button>
                </div>
              ))
            )}
            {canSee && avulsoSkipped.count > 0 && (
              <div
                className="px-3 py-2 border-t border-border bg-bg2/30 text-[11px] text-text2"
                title={avulsoSkipped.names.join("\n") + (avulsoSkipped.count > avulsoSkipped.names.length ? `\n+${avulsoSkipped.count - avulsoSkipped.names.length} outros` : "")}
              >
                <span className="inline-block px-1.5 py-0.5 rounded bg-bg2 text-text2 font-semibold mr-1">avulso</span>
                {avulsoSkipped.count} procedimento(s) avulso(s) sem alerta de "pacote acabando" (sessão única).
              </div>
            )}
            <div className="px-3 py-2 border-t bg-card sticky bottom-0">
              <Link to="/notificacoes" onClick={() => setOpen(false)} className="block text-center text-xs font-semibold text-navy hover:text-gold">
                Ver todas as notificações →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===== Geradores =====

async function genLowPackages(): Promise<{ count: number; names: string[] }> {
  const { data: pkgs } = await supabase
    .from("packages")
    .select("id,client_id,sess_total,sess_done,procedures(name),clients(name)")
    .eq("status", "active");
  type Row = {
    id: string; client_id: string; sess_total: number; sess_done: number;
    procedures: { name: string } | { name: string }[] | null;
    clients: { name: string } | { name: string }[] | null;
  };
  const mapped = ((pkgs ?? []) as unknown as Row[])
    .map((p) => ({
      id: p.id, client_id: p.client_id,
      procName: Array.isArray(p.procedures) ? p.procedures[0]?.name : p.procedures?.name,
      cliName: Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name,
      remaining: Number(p.sess_total ?? 0) - Number(p.sess_done ?? 0),
      sess_total: Number(p.sess_total ?? 0),
    }));
  const candidates = mapped.filter((p) => p.remaining > 0 && p.remaining <= 2 && Number(p.sess_total ?? 0) > 1);
  const avulsoSkipped = mapped.filter((p) => p.remaining > 0 && p.remaining <= 2 && p.sess_total === 1);
  const skipInfo = {
    count: avulsoSkipped.length,
    names: avulsoSkipped.slice(0, 5).map((p) => `${p.cliName ?? "Cliente"} — ${p.procName ?? "Procedimento"}`),
  };
  if (!candidates.length) return skipInfo;

  const refIds = candidates.map((c) => c.id);
  const { data: existing } = await supabase
    .from("notifications")
    .select("id,reference_id,body,is_read")
    .eq("type", "package_low")
    .in("reference_id", refIds);
  const byRef = new Map<string, { id: string; body: string | null; is_read: boolean }>();
  for (const e of (existing ?? []) as Array<{ id: string; reference_id: string; body: string | null; is_read: boolean }>) {
    byRef.set(e.reference_id, e);
  }

  const toInsert: Array<Record<string, unknown>> = [];
  for (const c of candidates) {
    const body = `⚠️ ${c.cliName ?? "Cliente"} — ${c.procName ?? "Procedimento"} com ${c.remaining} sessão(ões) restante(s)`;
    const ex = byRef.get(c.id);
    if (ex) {
      if (ex.body !== body && ex.is_read) {
        await supabase.from("notifications").delete().eq("id", ex.id);
      } else {
        continue;
      }
    }
    toInsert.push({
      type: "package_low",
      target_roles: ["admin", "receptionist"],
      title: "Pacote vencendo",
      body,
      action_url: `/clientes/${c.client_id}?pkg=${c.id}`,
      client_id: c.client_id,
      deep_tab: "sessoes",
      reference_id: c.id,
      reference_type: "package",
    });
  }
  if (toInsert.length) await supabase.from("notifications").insert(toInsert);
  return skipInfo;
}

async function genInactiveClients() {
  const now = Date.now();
  const d30 = new Date(now - 30 * 86400000).toISOString();
  const d60 = new Date(now - 60 * 86400000).toISOString();
  const { data: clients } = await supabase
    .from("clients").select("id,name").eq("active", true).limit(500);
  if (!clients?.length) return;
  const ids = (clients as Array<{ id: string; name: string }>).map((c) => c.id);
  const { data: lastSess } = await supabase
    .from("sessions").select("client_id,done_at").in("client_id", ids).eq("status", "done").order("done_at", { ascending: false });
  const lastByClient = new Map<string, string>();
  for (const s of (lastSess ?? []) as Array<{ client_id: string; done_at: string }>) {
    if (!lastByClient.has(s.client_id)) lastByClient.set(s.client_id, s.done_at);
  }

  const { data: existing } = await supabase
    .from("notifications")
    .select("reference_id,reference_type")
    .in("type", ["client_inactive_30", "client_inactive_60"])
    .in("reference_id", ids);
  const seen = new Set(
    ((existing ?? []) as Array<{ reference_id: string; reference_type: string | null }>)
      .map((e) => `${e.reference_type}:${e.reference_id}`),
  );

  const toInsert: Array<Record<string, unknown>> = [];
  for (const c of clients as Array<{ id: string; name: string }>) {
    const last = lastByClient.get(c.id);
    if (!last) continue;
    if (last < d60) {
      if (seen.has(`client_inactive_60:${c.id}`)) continue;
      toInsert.push({
        type: "client_inactive_60", target_roles: ["admin", "receptionist"],
        title: "Cliente sumindo (+60 dias)", body: `👻 ${c.name} sem visita há mais de 60 dias`,
        action_url: `/clientes?inactive60=${c.id}`, client_id: c.id, deep_tab: "dados",
        reference_id: c.id, reference_type: "client_inactive_60",
      });
    } else if (last < d30) {
      if (seen.has(`client_inactive_30:${c.id}`)) continue;
      toInsert.push({
        type: "client_inactive_30", target_roles: ["admin", "receptionist"],
        title: "Cliente sumindo (+30 dias)", body: `👻 ${c.name} sem visita há mais de 30 dias`,
        action_url: `/clientes?inactive30=${c.id}`, client_id: c.id, deep_tab: "dados",
        reference_id: c.id, reference_type: "client_inactive_30",
      });
    }
  }
  if (toInsert.length) await supabase.from("notifications").insert(toInsert);
}

async function genUnconfirmed(user: { id: string } | null | undefined) {
  if (!user) return;
  const now = new Date().toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: appts } = await supabase
    .from("appointments")
    .select("id, client_id, professional_id, datetime, clients(name), procedures(name)")
    .eq("status", "confirmed")
    .lt("datetime", now)
    .gte("datetime", oneDayAgo);

  if (!appts?.length) return;

  // Busca notificações já existentes para não duplicar
  const { data: existing } = await supabase
    .from("notifications")
    .select("reference_id")
    .eq("type", "appointment_unconfirmed")
    .eq("user_id", user.id)
    .in("reference_id", appts.map(a => a.id));

  const existingIds = new Set((existing ?? []).map(e => e.reference_id).filter(Boolean));

  type ApptRow = { id: string; clients: { name: string } | null; procedures: { name: string } | null };
  const toInsert = (appts as unknown as ApptRow[])
    .filter(a => !existingIds.has(a.id))
    .map(a => ({
      type: "appointment_unconfirmed",
      title: "⏰ Sessão não confirmada",
      body: `${a.clients?.name ?? "Cliente"} — ${a.procedures?.name ?? "Procedimento"} não foi confirmado`,
      user_id: user.id,
      reference_id: a.id,
      reference_type: "appointment",
      is_read: false,
    }));

  if (toInsert.length) {
    await supabase.from("notifications").insert(toInsert);
  }
}
