import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconSearch, IconCheck, IconPackage } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fechar-pacote")({
  component: ClosePackagePage,
});

type Client = { id: string; name: string; record_num: number; phone: string | null };
type Procedure = {
  id: string; name: string; duration_min: number | null;
  price_single: number | null; price_5: number | null; price_10: number | null; price_20: number | null;
};

const PAY_METHODS = ["Pix", "Cartão Crédito", "Cartão Débito", "Dinheiro", "Transferência"];

function ClosePackagePage() {
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Client[]>([]);
  const [procs, setProcs] = useState<Procedure[]>([]);
  const [procId, setProcId] = useState("");
  const [sessions, setSessions] = useState<5 | 10 | 20>(10);
  const [pricePaid, setPricePaid] = useState("");
  const [payMethod, setPayMethod] = useState(PAY_METHODS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("procedures").select("*").eq("active", true).order("name");
      setProcs((data as Procedure[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (search.length < 2 || client) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("clients")
        .select("id,name,record_num,phone")
        .ilike("name", `%${search}%`)
        .eq("active", true)
        .limit(8);
      setResults((data as Client[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, client]);

  const proc = procs.find((p) => p.id === procId) ?? null;
  const fullPrice = proc ? (sessions === 5 ? proc.price_5 : sessions === 10 ? proc.price_10 : proc.price_20) : null;
  const paid = pricePaid ? Number(pricePaid) : fullPrice ?? 0;
  const discount = fullPrice && paid < fullPrice ? fullPrice - paid : 0;
  const discountPct = fullPrice ? (discount / fullPrice) * 100 : 0;

  const submit = async () => {
    if (!client) return toast.error("Selecione uma cliente");
    if (!proc) return toast.error("Selecione um procedimento");
    if (!fullPrice) return toast.error("Procedimento não tem preço cadastrado para esse pacote");
    if (!payMethod) return toast.error("Selecione a forma de pagamento");

    setBusy(true);
    try {
      const { data: pkg, error: pkgErr } = await supabase
        .from("packages")
        .insert({
          client_id: client.id,
          procedure_id: proc.id,
          sess_total: sessions,
          sess_done: 0,
          price_full: fullPrice,
          price_paid: paid,
          discount_pct: discountPct,
          pay_method: payMethod,
          status: "active",
        })
        .select("id")
        .single();
      if (pkgErr) throw pkgErr;

      // Create session rows
      const sessRows = Array.from({ length: sessions }, (_, i) => ({
        package_id: (pkg as { id: string }).id,
        client_id: client.id,
        session_num: i + 1,
        status: "pending",
      }));
      const { error: sErr } = await supabase.from("sessions").insert(sessRows);
      if (sErr) throw sErr;

      toast.success(`Pacote fechado! ${sessions} sessões criadas.`);
      navigate({ to: "/clientes/$id", params: { id: client.id } });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao fechar pacote");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Step 1: client */}
      <div className="bh-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-gold text-white text-xs font-bold flex items-center justify-center">1</span>
          <div className="font-display text-lg text-navy">Cliente</div>
        </div>
        {client ? (
          <div className="flex items-center justify-between bg-bg2 rounded-lg p-3">
            <div>
              <div className="font-semibold text-navy">{client.name}</div>
              <div className="text-text3 text-xs">Ficha #{client.record_num} · {client.phone ?? "sem telefone"}</div>
            </div>
            <button onClick={() => { setClient(null); setSearch(""); }} className="text-sm text-text2 hover:text-navy">Trocar</button>
          </div>
        ) : (
          <div className="relative">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente pelo nome..."
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border"
              autoFocus
            />
            {results.length > 0 && (
              <div className="mt-1 bh-card max-h-60 overflow-y-auto absolute z-10 w-full bg-card">
                {results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setClient(c); setSearch(""); setResults([]); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-bg2 text-sm border-b last:border-0"
                  >
                    <div className="font-semibold text-navy">{c.name}</div>
                    <div className="text-text3 text-xs">#{c.record_num} · {c.phone ?? "—"}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2: procedure */}
      <div className={`bh-card p-5 ${!client ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-gold text-white text-xs font-bold flex items-center justify-center">2</span>
          <div className="font-display text-lg text-navy">Procedimento</div>
        </div>
        <select value={procId} onChange={(e) => setProcId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-border">
          <option value="">Selecionar procedimento...</option>
          {procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Step 3: package size */}
      <div className={`bh-card p-5 ${!proc ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-gold text-white text-xs font-bold flex items-center justify-center">3</span>
          <div className="font-display text-lg text-navy">Quantidade de sessões</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {([5, 10, 20] as const).map((n) => {
            const price = proc ? (n === 5 ? proc.price_5 : n === 10 ? proc.price_10 : proc.price_20) : null;
            const disabled = price == null;
            return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => { setSessions(n); setPricePaid(""); }}
                className={`p-4 rounded-lg border-2 transition ${
                  sessions === n && !disabled
                    ? "border-gold bg-gold/10"
                    : "border-border hover:border-gold/40"
                } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <div className="font-display text-2xl text-navy">{n}</div>
                <div className="text-xs text-text2">sessões</div>
                <div className="text-sm font-semibold text-gold mt-2">
                  {price ? price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 4: payment */}
      <div className={`bh-card p-5 ${!fullPrice ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-gold text-white text-xs font-bold flex items-center justify-center">4</span>
          <div className="font-display text-lg text-navy">Pagamento</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Forma de pagamento</label>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm">
              {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">Valor pago (R$)</label>
            <input
              type="number" step="0.01" value={pricePaid}
              onChange={(e) => setPricePaid(e.target.value)}
              placeholder={fullPrice?.toFixed(2)}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
            />
          </div>
        </div>

        {fullPrice && (
          <div className="bg-bg2 rounded-lg p-4 mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-text2">Valor cheio</span><span className="font-semibold">{fullPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
            <div className="flex justify-between"><span className="text-text2">Desconto</span><span className="font-semibold text-danger">- {discount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ({discountPct.toFixed(1)}%)</span></div>
            <div className="flex justify-between pt-2 border-t mt-2"><span className="font-display text-navy">Total</span><span className="font-display text-xl text-gold">{paid.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={busy || !client || !proc || !fullPrice}
          className="px-6 py-3 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 disabled:opacity-50 flex items-center gap-2"
        >
          <IconPackage size={18} /> {busy ? "Fechando..." : "Fechar pacote"}
        </button>
      </div>
    </div>
  );
}
