import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { IconSearch, IconPackage, IconTrash, IconPlus, IconLock, IconFileText } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/with-timeout";
import { toast } from "sonner";
import { ContractModal, type ContractInput } from "@/components/contracts/ContractModal";
import { PasswordInput } from "@/components/ui/password-input";

export const Route = createFileRoute("/_authenticated/fechar-pacote")({
  component: ClosePackagePage,
  validateSearch: (search: Record<string, unknown>) => ({
    clientId: typeof search.clientId === "string" ? search.clientId : undefined,
    procedureId: typeof search.procedureId === "string" ? search.procedureId : undefined,
  }),
});


type Client = { id: string; name: string; record_num: number; phone: string | null };
type Procedure = {
  id: string; name: string; duration_min: number | null;
  price_single: number | null; price_5: number | null; price_10: number | null; price_20: number | null;
  session_type: string | null;
};

type CartItem = {
  uid: string;
  procedure: Procedure;
  sessions: number;
  price: number;
  is_courtesy?: boolean;
};


const PAY_METHODS = ["Pix", "Cartão Crédito", "Cartão Débito", "Dinheiro", "Transferência", "Cheque"];
const INSTALLMENT_METHODS = ["Cartão Crédito", "Cheque"];

function ClosePackagePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clientId: prefillClientId, procedureId: prefillProcId } = Route.useSearch();
  const [client, setClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Client[]>([]);
  const [procs, setProcs] = useState<Procedure[]>([]);
  const [procId, setProcId] = useState("");
  const [sessions, setSessions] = useState<number>(10);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payMethod, setPayMethod] = useState(PAY_METHODS[0]);
  const [installments, setInstallments] = useState(1);
  const showInstallments = INSTALLMENT_METHODS.includes(payMethod);
  const effectiveInstallments = showInstallments ? Math.max(1, installments) : 1;
  const payMethodLabel = showInstallments && effectiveInstallments > 1 ? `${payMethod} ${effectiveInstallments}x` : payMethod;
  const [discountPct, setDiscountPct] = useState(0);
  const [discountType, setDiscountType] = useState<"pct" | "fixed">("pct");
  const [discountFixed, setDiscountFixed] = useState(0);
  const [customMode, setCustomMode] = useState(false);
  const [customQty, setCustomQty] = useState(2);
  const [customPrice, setCustomPrice] = useState(0);
  const [discountUnlocked, setDiscountUnlocked] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [contractInput, setContractInput] = useState<ContractInput | null>(null);

  // Taxa de cartão
  const isCard = payMethod.startsWith("Cartão");
  const [cardFeePct, setCardFeePct] = useState<string>("");
  const [cardFeePayer, setCardFeePayer] = useState<"empresa" | "cliente">("empresa");
  const cardFeePctNum = cardFeePct === "" ? 0 : Math.max(0, Math.min(20, Number(cardFeePct.replace(",", ".")) || 0));


  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("procedures").select("id,name,duration_min,price_single,price_5,price_10,price_20,session_type").eq("active", true).order("name");
      setProcs((data as Procedure[]) ?? []);

    })();
  }, []);

  // Pré-seleciona cliente quando a página é aberta via redirect da agenda (avulso)
  useEffect(() => {
    if (!prefillClientId || client) return;
    supabase.from("clients").select("id,name,record_num,phone").eq("id", prefillClientId).maybeSingle()
      .then(({ data }) => { if (data) setClient(data as Client); });
  }, [prefillClientId, client]);

  // Pré-seleciona procedimento no dropdown assim que procs carregarem e o cliente estiver definido
  useEffect(() => {
    if (!prefillProcId || !procs.length || !client) return;
    setProcId(prefillProcId);
  }, [prefillProcId, procs, client]);

  useEffect(() => {
    if (search.length < 2 || client) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("clients").select("id,name,record_num,phone,cpf,address,birthdate")
        .ilike("name", `%${search}%`).eq("active", true).limit(8);
      setResults((data as Client[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [search, client]);

  const currentProc = procs.find((p) => p.id === procId) ?? null;
  const isAvulso = ["avulso", "especial", "por_disparo"].includes(currentProc?.session_type ?? "");
  const currentPrice = currentProc
    ? (customMode && !isAvulso
        ? (customPrice > 0 ? customPrice : null)
        : (isAvulso ? currentProc.price_single : (sessions === 5 ? currentProc.price_5 : sessions === 10 ? currentProc.price_10 : currentProc.price_20)))
    : null;

  useEffect(() => {
    if (isAvulso) setSessions(1);
    else if (sessions === 1) setSessions(10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAvulso]);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + (i.is_courtesy ? 0 : i.price), 0), [cart]);
  const discountVal = discountType === "fixed"
    ? Math.min(discountFixed, subtotal)
    : (subtotal * discountPct) / 100;
  const discountFactor = subtotal > 0 ? (1 - discountVal / subtotal) : 1;
  const baseTotal = subtotal - discountVal;
  const cardFeeVal = isCard && cardFeePctNum > 0 ? baseTotal * (cardFeePctNum / 100) : 0;
  const total = baseTotal + (isCard && cardFeePayer === "cliente" ? cardFeeVal : 0);

  const addItem = () => {
    if (!currentProc || !currentPrice) return toast.error("Selecione um procedimento com preço");
    const effSessions = isAvulso ? 1 : (customMode ? customQty : sessions);
    setCart((c) => [...c, {
      uid: crypto.randomUUID(),
      procedure: currentProc,
      sessions: effSessions,
      price: currentPrice,
    }]);
    setProcId("");
    setCustomMode(false);
    setCustomPrice(0);
  };


  const removeItem = (uid: string) => setCart((c) => c.filter((i) => i.uid !== uid));

  const unlockDiscount = async () => {
    // TODO SEGURANÇA: mover validação de admin_password para Edge Function/RPC com hash antes da entrega final
    const { data } = await supabase.from("settings").select("admin_password").limit(1).maybeSingle();
    const expected = (data as { admin_password: string } | null)?.admin_password;
    if (!expected) { toast.error("Erro ao verificar senha"); return; }
    if (adminPin === expected) {
      setDiscountUnlocked(true);
      toast.success("Desconto liberado");
    } else {
      toast.error("Senha admin incorreta");
    }
  };

  const submit = async () => {
    if (!client) return toast.error("Selecione uma cliente");
    if (cart.length === 0) return toast.error("Adicione pelo menos um procedimento");
    if (!payMethod) return toast.error("Selecione forma de pagamento");

    setBusy(true);
    try {
      // 1) Cria todos os pacotes em paralelo
      const pkgResults = await withTimeout<Array<{ data: { id: string } | null; error: { message: string } | null }>>(
        Promise.all(
          cart.map((item) => {
            if (item.is_courtesy) {
              return supabase
                .from("packages")
                .insert({
                  client_id: client.id,
                  procedure_id: item.procedure.id,
                  sess_total: item.sessions,
                  sess_done: 0,
                  price_full: 0,
                  price_paid: 0,
                  discount_pct: 100,
                  pay_method: "Cortesia",
                  status: "active",
                  is_bonus: true,
                  bonus_validated: true,
                  bonus_validated_at: new Date().toISOString(),
                })
                .select("id")
                .single();
            }
            const itemFull = item.price;
            const itemPaid = itemFull * discountFactor;
            return supabase
              .from("packages")
              .insert({
                client_id: client.id,
                procedure_id: item.procedure.id,
                sess_total: item.sessions,
                sess_done: 0,
                price_full: itemFull,
                price_paid: itemPaid,
                discount_pct: subtotal > 0 ? Math.round((discountVal / subtotal) * 100) : 0,
                pay_method: payMethodLabel,
                status: "active",
              })
              .select("id")
              .single();
          }),
        ),
        15000,
        "Criação dos pacotes",
      );

      const allSessions: Array<{ package_id: string; client_id: string; session_num: number; status: string }> = [];
      pkgResults.forEach((res, idx) => {
        if (res.error || !res.data) throw new Error(res.error?.message ?? "Falha ao criar pacote");
        const item = cart[idx];
        for (let i = 0; i < item.sessions; i++) {
          allSessions.push({
            package_id: res.data.id,
            client_id: client.id,
            session_num: i + 1,
            status: "pending",
          });
        }
      });

      // 2) Insere TODAS as sessões num único insert (em vez de N requests)
      const { error: sErr } = await withTimeout<{ error: { message: string } | null }>(
        supabase.from("sessions").insert(allSessions),
        15000,
        "Criação das sessões",
      );
      if (sErr) throw sErr;

      const pkgIds = pkgResults.map((r) => r.data!.id);
      const paidPkgIds = pkgResults.filter((_, idx) => !cart[idx].is_courtesy).map((r) => r.data!.id);

      // Taxa de cartão — UPDATE no income já criado pelo trigger (apenas itens pagos)
      if (isCard && cardFeePctNum > 0) {
        const feePctNum = cardFeePctNum;
        const feeValueTotal = baseTotal * (feePctNum / 100);
        try {
          if (paidPkgIds.length > 0) {
            const { error: feeError } = await supabase
              .from("income")
              .update({ card_fee_pct: feePctNum, card_fee_payer: cardFeePayer })
              .in("package_id", paidPkgIds);
            if (feeError) console.error("Erro ao salvar taxa de cartão:", feeError);
          }
          if (cardFeePayer === "empresa") {
            await supabase.from("expenses").insert({
              description: `Taxa de cartão (${feePctNum}%) — ${client.name}`,
              amount: feeValueTotal,
              category: "Taxas",
            });
          }
        } catch (e) {
          console.warn("Taxa de cartão — pós-processo falhou:", e);
        }
      }

      const items = cart.map((it) => ({
        procedure_name: it.procedure.name,
        sessions: it.sessions,
        unit_price: it.is_courtesy ? 0 : it.price * discountFactor / it.sessions,
        total: it.is_courtesy ? 0 : it.price * discountFactor,
      }));
      // Invalida imediatamente para que a aba Sessões reflita o novo pacote sem aguardar o realtime
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && ["client-sessions", "packages", "sessions", "income", "dashboard"].includes(String(q.queryKey[0])) });
      toast.success(`Pacote fechado! ${cart.length} item(s) adicionado(s).`);
      setContractInput({
        clientId: client.id,
        packageIds: pkgIds,
        items,
        total,
        paymentMethod: payMethodLabel,
        installments: showInstallments ? effectiveInstallments : null,
      });

    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao fechar pacote");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
      {/* LEFT COLUMN */}
      <div className="space-y-4">
        {/* Cliente */}
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

        {/* Adicionar procedimento */}
        <div className={`bh-card p-5 ${!client ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-gold text-white text-xs font-bold flex items-center justify-center">2</span>
            <div className="font-display text-lg text-navy">Adicionar procedimento</div>
          </div>
          <select value={procId} onChange={(e) => setProcId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-border mb-3">
            <option value="">Selecionar procedimento...</option>
            {procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {isAvulso ? (
            <div className="mb-3 p-3 rounded-lg border-2 border-gold bg-gold/10 text-center">
              <div className="font-display text-xl text-navy">1 sessão</div>
              <div className="text-sm font-semibold text-gold mt-1">
                {currentPrice ? currentPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
              </div>
              <div className="text-[10px] text-text3 uppercase mt-1">Procedimento avulso</div>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2 mb-3">
              {/* Botão Avulso */}
              <button
                type="button"
                onClick={() => { setSessions(1); setCustomMode(false); }}
                className={`p-3 rounded-lg border-2 transition ${
                  sessions === 1 && !customMode ? "border-gold bg-gold/10" : "border-border hover:border-gold/40"
                }`}
              >
                <div className="font-display text-base text-navy">1</div>
                <div className="text-[10px] text-text2 uppercase">avulso</div>
                <div className="text-xs font-semibold text-gold mt-1">
                  {currentProc?.price_single
                    ? currentProc.price_single.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                    : "—"}
                </div>
              </button>
              {([5, 10, 20] as const).map((n) => {
                const price = currentProc ? (n === 5 ? currentProc.price_5 : n === 10 ? currentProc.price_10 : currentProc.price_20) : null;
                const disabled = price == null;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    onClick={() => { setSessions(n); setCustomMode(false); }}
                    className={`p-3 rounded-lg border-2 transition ${
                      sessions === n && !disabled && !customMode ? "border-gold bg-gold/10" : "border-border hover:border-gold/40"
                    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <div className="font-display text-xl text-navy">{n}</div>
                    <div className="text-[10px] text-text2 uppercase">sessões</div>
                    <div className="text-xs font-semibold text-gold mt-1">
                      {price ? price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => { setCustomMode(true); setSessions(customQty); }}
                className={`p-3 rounded-lg border-2 transition ${
                  customMode ? "border-gold bg-gold/10" : "border-border hover:border-gold/40"
                }`}
              >
                <div className="font-display text-base text-navy">★</div>
                <div className="text-[10px] text-text2 uppercase">personalizado</div>
                <div className="text-xs font-semibold text-gold mt-1">livre</div>
              </button>
            </div>
          )}

          {customMode && !isAvulso && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-[10px] text-text2 uppercase mb-1">Qtd. sessões</label>
                <input
                  type="number" min="1" step="1"
                  value={customQty}
                  onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); setCustomQty(v); setSessions(v); }}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text2 uppercase mb-1">Valor total (R$)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm"
                  placeholder="Ex: 1500,00"
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={addItem}
            disabled={!currentProc || !currentPrice}
            className="w-full px-4 py-2.5 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <IconPlus size={18} /> Adicionar ao pacote
          </button>
          <button
            type="button"
            onClick={() => {
              if (!currentProc) return toast.error("Selecione um procedimento");
              const item: CartItem = {
                uid: crypto.randomUUID(),
                procedure: currentProc,
                sessions: isAvulso ? 1 : sessions,
                price: 0,
                is_courtesy: true,
              };
              setCart((c) => [...c, item]);
              toast.success(`Cortesia adicionada: ${currentProc.name}`);
            }}
            disabled={!currentProc}
            className="w-full px-4 py-2 rounded-lg border border-dashed border-gold text-gold text-sm font-semibold hover:bg-gold/10 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            🎁 Adicionar como cortesia (R$ 0,00)
          </button>
        </div>

        {/* Pagamento */}
        <div className={`bh-card p-5 ${cart.length === 0 ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-gold text-white text-xs font-bold flex items-center justify-center">3</span>
            <div className="font-display text-lg text-navy">Forma de pagamento</div>
          </div>
          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-border">
            {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {showInstallments && (
            <div className="mt-3">
              <label className="block text-xs font-semibold text-text2 uppercase mb-1">Parcelas</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={installments}
                  onChange={(e) => setInstallments(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                  className="w-24 px-3 py-2 rounded-lg border border-border"
                />
                <span className="text-sm text-text2">
                  {effectiveInstallments}x de {(total / effectiveInstallments).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            </div>
          )}
          {isCard && (
            <div className="mt-3 border-t pt-3 space-y-2">
              <label className="block text-xs font-semibold text-text2 uppercase">Taxa de cartão</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.1}
                  value={cardFeePct}
                  onChange={(e) => setCardFeePct(e.target.value)}
                  className="w-24 px-3 py-2 rounded-lg border border-border"
                  placeholder="%"
                />
                <span className="text-xs text-text2">% sobre o total</span>
              </div>
              {cardFeePctNum > 0 && (
                <div className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={cardFeePayer === "empresa"} onChange={() => setCardFeePayer("empresa")} />
                    Empresa absorve (lança despesa)
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={cardFeePayer === "cliente"} onChange={() => setCardFeePayer("cliente")} />
                    Cliente paga (acrescenta no recebido)
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN — Sticky resumo */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="bh-card p-5 space-y-4">
          <div className="font-display text-lg text-navy">Resumo do pacote</div>

          {cart.length === 0 ? (
            <div className="text-center py-8 text-text3 text-sm border-2 border-dashed border-border rounded-lg">
              Nenhum item adicionado
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((it) => (
                <div key={it.uid} className="flex items-start gap-2 bg-bg2 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-navy text-sm flex items-center gap-1.5 flex-wrap">
                      {it.procedure.name}
                      {it.is_courtesy && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">CORTESIA</span>
                      )}
                    </div>
                    <div className="text-text3 text-xs">{it.sessions} sessões</div>
                    <div className="text-gold font-semibold text-sm mt-0.5">
                      {it.is_courtesy
                        ? "R$ 0,00"
                        : it.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </div>
                  </div>
                  <button onClick={() => removeItem(it.uid)} className="p-1 rounded text-text2 hover:text-danger" title="Remover">
                    <IconTrash size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Desconto */}
          <div className="border-t pt-3">
            <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">
              Desconto {!discountUnlocked && <IconLock size={12} className="inline ml-1" />}
            </label>
            {discountUnlocked ? (
              <div className="space-y-2">
                <div className="flex gap-1">
                  <button type="button" onClick={() => setDiscountType("pct")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${discountType === "pct" ? "border-gold bg-gold/10 text-navy" : "border-border text-text2"}`}>
                    % Porcentagem
                  </button>
                  <button type="button" onClick={() => setDiscountType("fixed")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${discountType === "fixed" ? "border-gold bg-gold/10 text-navy" : "border-border text-text2"}`}>
                    R$ Valor fixo
                  </button>
                </div>
                {discountType === "pct" ? (
                  <input
                    type="number" min="0" max="100" step="1"
                    value={discountPct}
                    onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm"
                    placeholder="Ex: 10"
                  />
                ) : (
                  <input
                    type="number" min="0" step="0.01"
                    value={discountFixed}
                    onChange={(e) => setDiscountFixed(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm"
                    placeholder="Ex: 350,00"
                  />
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <PasswordInput
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="Senha admin"
                  className="flex-1 px-3 py-2 rounded-lg border border-border text-sm"
                  wrapperClassName="flex-1"
                />
                <button onClick={unlockDiscount} className="px-3 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy2">
                  Liberar
                </button>
              </div>
            )}
          </div>

          {/* Totais */}
          <div className="space-y-1.5 text-sm border-t pt-3">
            <div className="flex justify-between"><span className="text-text2">Subtotal</span><span className="font-semibold">{subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
            {discountVal > 0 && (
              <div className="flex justify-between"><span className="text-text2">Desconto {discountType === "pct" ? `(${discountPct}%)` : "(valor fixo)"}</span><span className="font-semibold text-danger">- {discountVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
            )}
            {cardFeeVal > 0 && (
              <div className="flex justify-between">
                <span className="text-text2">Taxa de cartão ({cardFeePctNum}%)</span>
                {cardFeePayer === "cliente" ? (
                  <span className="font-semibold">+ {cardFeeVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                ) : (
                  <span className="font-semibold text-danger">- {cardFeeVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (despesa)</span>
                )}
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t mt-2">
              <span className="font-display text-navy">Total</span>
              <span className="font-display text-2xl text-gold">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
          </div>

          <button
            onClick={submit}
            disabled={busy || !client || cart.length === 0}
            className="w-full px-6 py-3 rounded-lg bg-gold text-white font-semibold hover:bg-gold2 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <IconPackage size={18} /> {busy ? "Fechando..." : "Confirmar pacote"}
          </button>
        </div>
      </div>

      {contractInput && client && (
        <ContractModal
          input={contractInput}
          client={{ id: client.id, name: client.name, cpf: (client as { cpf?: string | null }).cpf ?? null, phone: client.phone ?? null, address: (client as { address?: string | null }).address ?? null, record_num: client.record_num ?? null }}
          onClose={() => {
            setContractInput(null);
            navigate({ to: "/clientes/$id", params: { id: client.id } });
          }}
        />
      )}

    </div>
  );

}
