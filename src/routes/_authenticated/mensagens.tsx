import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconCake, IconPackage, IconUserOff, IconSparkles, IconBrandWhatsapp, IconX } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { generateCampaignMessage } from "@/lib/ai-messages.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mensagens")({
  component: MensagensPage,
});

type Audience = "aniversariantes" | "pacote_acabando" | "inativos";

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  pacote?: string;
  sessoes_restantes?: number;
  dias_sem_vir?: number;
};

function MensagensPage() {
  const { user } = useAuth();
  const canAccess = user?.role === "admin" || user?.role === "receptionist";

  const [counts, setCounts] = useState<Record<Audience, number>>({ aniversariantes: 0, pacote_acabando: 0, inativos: 0 });
  const [data, setData] = useState<Record<Audience, ClientRow[]>>({ aniversariantes: [], pacote_acabando: [], inativos: [] });
  const [openModal, setOpenModal] = useState<Audience | null>(null);
  const [openList, setOpenList] = useState<Audience | null>(null);

  useEffect(() => {
    if (!canAccess) return;
    (async () => {
      const month = new Date().getMonth() + 1;
      const pad = String(month).padStart(2, "0");
      const lastDay = new Date(2000, Number(pad), 0).getDate();
      const lastDayPad = String(lastDay).padStart(2, "0");
      const today = new Date();
      const c60 = new Date(today); c60.setDate(c60.getDate() - 60);
      const c60s = c60.toISOString().slice(0, 10);

      // 1. Aniversariantes do mês (query padronizada com relatórios)
      const fromDate = `1900-${pad}-01`;
      const toDate = `2099-${pad}-${lastDayPad}`;
      const { data: birthdayRows, error: birthdayErr } = await supabase
        .from("clients")
        .select("id,name,phone,birthdate,record_num")
        .eq("active", true)
        .not("birthdate", "is", null)
        .gte("birthdate", fromDate)
        .lte("birthdate", toDate)
        .order("birthdate");
      if (birthdayErr) {
        console.error("[mensagens] Falha no filtro de birthdate", { month, pad, lastDay, lastDayPad, fromDate, toDate, error: birthdayErr });
        toast.error(`Falha no filtro de aniversariantes (${fromDate} → ${toDate}): ${birthdayErr.message}`);
      }
      const annivers = (birthdayRows ?? []).map((c: { id: string; name: string; phone: string | null }) => ({
        id: c.id, name: c.name, phone: c.phone,
      }));

      const { data: clients } = await supabase
        .from("clients").select("id,name,phone,birthdate")
        .eq("active", true);


      // 2. Pacote acabando
      const { data: pkgs } = await supabase
        .from("packages")
        .select("client_id,sess_total,sess_done,status,procedures(name),clients(name,phone)")
        .eq("status", "active");
      type PkgRow = {
        client_id: string; sess_total: number | null; sess_done: number | null;
        procedures: { name: string } | { name: string }[] | null;
        clients: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null;
      };
      const pacoteAcabando: ClientRow[] = ((pkgs as unknown as PkgRow[]) ?? [])
        .map((p) => {
          const rem = Number(p.sess_total ?? 0) - Number(p.sess_done ?? 0);
          const proc = Array.isArray(p.procedures) ? p.procedures[0] : p.procedures;
          const cli = Array.isArray(p.clients) ? p.clients[0] : p.clients;
          return { client_id: p.client_id, rem, procName: proc?.name ?? "—", cli };
        })
        .filter((x) => x.rem > 0 && x.rem <= 2 && x.cli)
        .map((x) => ({
          id: x.client_id, name: x.cli!.name, phone: x.cli!.phone,
          pacote: x.procName, sessoes_restantes: x.rem,
        }));

      // 3. Inativos +60 dias
      const { data: sessions } = await supabase
        .from("sessions").select("client_id,done_at")
        .not("done_at", "is", null).eq("status", "done");
      const lastByClient = new Map<string, string>();
      ((sessions ?? []) as { client_id: string | null; done_at: string }[]).forEach((s) => {
        if (!s.client_id) return;
        const cur = lastByClient.get(s.client_id);
        if (!cur || s.done_at > cur) lastByClient.set(s.client_id, s.done_at);
      });
      const inativos: ClientRow[] = ((clients ?? []) as { id: string; name: string; phone: string | null }[])
        .filter((c) => {
          const last = lastByClient.get(c.id);
          return !last || last.slice(0, 10) < c60s;
        })
        .map((c) => {
          const last = lastByClient.get(c.id);
          const days = last ? Math.floor((today.getTime() - new Date(last).getTime()) / 86400000) : 999;
          return { id: c.id, name: c.name, phone: c.phone, dias_sem_vir: days };
        });

      setData({ aniversariantes: annivers, pacote_acabando: pacoteAcabando, inativos });
      setCounts({ aniversariantes: annivers.length, pacote_acabando: pacoteAcabando.length, inativos: inativos.length });
    })();
  }, [canAccess]);

  if (!canAccess) {
    return <div className="bh-card p-6 text-text2">Acesso restrito ao administrador e à recepção.</div>;
  }

  const AUDIENCES: { id: Audience; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
    { id: "aniversariantes", label: "🎂 Aniversariantes do mês", desc: "Clientes que fazem aniversário no mês atual.", icon: <IconCake size={22} />, color: "bg-gold/10 border-gold/40" },
    { id: "pacote_acabando", label: "📦 Pacote acabando", desc: "Pacotes ativos com 1 ou 2 sessões restantes.", icon: <IconPackage size={22} />, color: "bg-blue-500/10 border-blue-500/40" },
    { id: "inativos", label: "😴 Inativos +60 dias", desc: "Clientes sem atendimento há mais de 60 dias.", icon: <IconUserOff size={22} />, color: "bg-danger/10 border-danger/40" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="font-display text-3xl text-navy">Mensagens</div>
        <div className="text-text2 text-sm">Campanhas de WhatsApp por público com texto gerado por IA.</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {AUDIENCES.map((a) => (
          <div key={a.id} className={`bh-card p-5 border-2 ${a.color}`}>
            <div className="flex items-center gap-2 text-navy">{a.icon}<div className="font-display text-lg">{a.label}</div></div>
            <div className="text-xs text-text2 mt-1">{a.desc}</div>
            <div className="mt-3 font-display text-4xl text-navy">{counts[a.id]}</div>
            <div className="text-[11px] uppercase tracking-wide text-text3">cliente(s)</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setOpenModal(a.id)} className="px-3 py-1.5 rounded-lg bg-gold text-white text-xs font-semibold flex items-center gap-1 hover:bg-gold2">
                <IconSparkles size={14} /> Gerar mensagem com IA
              </button>
              <button type="button" onClick={() => setOpenList(a.id)} className="px-3 py-1.5 rounded-lg border border-border text-text2 text-xs font-semibold hover:bg-bg2">
                Ver lista
              </button>
            </div>
          </div>
        ))}
      </div>

      {openModal && (
        <GenerateModal
          audience={openModal}
          audienceLabel={AUDIENCES.find((a) => a.id === openModal)!.label}
          clients={data[openModal]}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openList && (
        <ListModal
          audienceLabel={AUDIENCES.find((a) => a.id === openList)!.label}
          clients={data[openList]}
          onClose={() => setOpenList(null)}
        />
      )}
    </div>
  );
}

function applyTemplate(tpl: string, c: ClientRow) {
  return tpl
    .replaceAll("{nome}", c.name.split(" ")[0] ?? c.name)
    .replaceAll("{pacote}", c.pacote ?? "")
    .replaceAll("{sessoes_restantes}", String(c.sessoes_restantes ?? ""))
    .replaceAll("{dias_sem_vir}", String(c.dias_sem_vir ?? ""));
}

function GenerateModal({ audience, audienceLabel, clients, onClose }: { audience: Audience; audienceLabel: string; clients: ClientRow[]; onClose: () => void }) {
  const { user } = useAuth();
  const generate = useServerFn(generateCampaignMessage);
  const [instruction, setInstruction] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const { text: out } = await generate({ data: { audience: audienceLabel, instruction } });
      setText(out);
      // log campanha
      await supabase.from("message_campaigns").insert({
        audience,
        message_template: out,
        client_count: clients.length,
        created_by: user?.id ?? null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar mensagem");
    } finally {
      setBusy(false);
    }
  };

  const sendOne = (c: ClientRow) => {
    if (!c.phone) return toast.error("Cliente sem telefone");
    const msg = applyTemplate(text, c);
    const phone = c.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone.startsWith("55") ? phone : "55" + phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">{audienceLabel}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Instrução para a IA</label>
            <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} placeholder='Ex: "promoção de 20% para aniversariantes em produtos de skincare"'
              className="w-full px-3 py-2 rounded-lg border border-border text-sm" />
          </div>
          <button type="button" onClick={handleGenerate} disabled={busy} className="px-4 py-2 rounded-lg bg-navy text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
            <IconSparkles size={16} /> {busy ? "Gerando..." : "Gerar texto"}
          </button>

          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Mensagem (editável)</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
              placeholder="O texto gerado pela IA aparecerá aqui. Use {nome}, {pacote}, {sessoes_restantes}, {dias_sem_vir}."
              className="w-full px-3 py-2 rounded-lg border border-border text-sm font-mono" />
            <div className="text-[11px] text-text3 mt-1">Placeholders: <code>{"{nome}"}</code> <code>{"{pacote}"}</code> <code>{"{sessoes_restantes}"}</code> <code>{"{dias_sem_vir}"}</code></div>
          </div>

          {text && (
            <div className="border-t pt-4">
              <div className="font-display text-lg text-navy mb-2">Enviar para clientes ({clients.length})</div>
              <div className="max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {clients.length === 0 ? (
                  <div className="p-4 text-text3 text-sm text-center">Nenhuma cliente neste público.</div>
                ) : clients.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2.5 text-sm">
                    <div>
                      <div className="font-semibold text-navy">{c.name}</div>
                      <div className="text-xs text-text3">{c.phone ?? "sem telefone"}</div>
                    </div>
                    <button type="button" onClick={() => sendOne(c)} disabled={!c.phone}
                      className="px-3 py-1.5 rounded-md bg-[#25D366] text-white text-xs font-semibold flex items-center gap-1 hover:opacity-90 disabled:opacity-40">
                      <IconBrandWhatsapp size={14} /> WhatsApp
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ListModal({ audienceLabel, clients, onClose }: { audienceLabel: string; clients: ClientRow[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="font-display text-2xl text-navy">{audienceLabel}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-bg2"><IconX size={18} /></button>
        </div>
        <div className="p-6">
          {clients.length === 0 ? (
            <div className="text-text3 text-sm text-center">Nenhuma cliente.</div>
          ) : (
            <div className="divide-y divide-border">
              {clients.map((c) => (
                <div key={c.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-semibold text-navy">{c.name}</div>
                    <div className="text-xs text-text3">
                      {c.phone ?? "sem telefone"}
                      {c.pacote && ` · ${c.pacote} (${c.sessoes_restantes} restante${(c.sessoes_restantes ?? 0) > 1 ? "s" : ""})`}
                      {typeof c.dias_sem_vir === "number" && c.dias_sem_vir < 999 && ` · ${c.dias_sem_vir} dias sem vir`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
