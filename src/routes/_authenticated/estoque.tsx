import { createFileRoute } from "@tanstack/react-router";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useEffect, useMemo, useState } from "react";
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconAlertTriangle,
  IconSearch,
  IconX,
  IconHistory,
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/estoque")({
  component: EstoquePage,
});

type Product = {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  unit: string | null;
  qty_current: number;
  qty_min: number;
  cost_price: number | null;
  active: boolean;
};

type Movement = {
  id: string;
  product_id: string;
  type: string;
  quantity: number;
  reason: string | null;
  notes: string | null;
  taken_by: string | null;
  created_at: string;
  expense_id: string | null;
  cost_total: number | null;
};


function EstoquePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low">("all");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [moving, setMoving] = useState<{ product: Product; type: "in" | "out" } | null>(null);
  const [historyOf, setHistoryOf] = useState<Product | null>(null);
  const [globalHistory, setGlobalHistory] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) toast.error(error.message);
    setProducts((data as never) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let r = products;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.brand ?? "").toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q),
      );
    }
    if (filter === "low") r = r.filter((p) => Number(p.qty_current) <= Number(p.qty_min));
    return r;
  }, [products, search, filter]);

  const lowCount = products.filter((p) => Number(p.qty_current) <= Number(p.qty_min)).length;
  const totalValue = products.reduce(
    (s, p) => s + Number(p.qty_current) * Number(p.cost_price ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-display text-3xl text-navy">Estoque</div>
          <div className="text-text2 text-sm">Produtos, entradas, saídas e alertas de mínimo</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGlobalHistory(true)}
            className="px-4 py-2 rounded-lg border border-border text-text2 font-semibold hover:bg-bg2 flex items-center gap-2"
          >
            <IconHistory size={16} /> Histórico
          </button>
          <button
            onClick={() => setEditing("new")}
            className="px-4 py-2 rounded-lg bg-navy text-white font-semibold hover:bg-navy2 flex items-center gap-2"
          >
            <IconPlus size={16} /> Novo produto
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Produtos ativos" value={String(products.length)} />
        <Stat
          label="Abaixo do mínimo"
          value={String(lowCount)}
          tone={lowCount > 0 ? "danger" : "ok"}
        />
        <Stat label="Valor em estoque" value={`R$ ${totalValue.toFixed(2)}`} />
      </div>

      <div className="bh-card p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, marca ou categoria..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm"
          />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-2 ${filter === "all" ? "bg-navy text-white" : "bg-card text-text2 hover:bg-bg2"}`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter("low")}
            className={`px-3 py-2 flex items-center gap-1 ${filter === "low" ? "bg-danger text-white" : "bg-card text-text2 hover:bg-bg2"}`}
          >
            <IconAlertTriangle size={14} /> Em alerta ({lowCount})
          </button>
        </div>
      </div>

      <div className="bh-card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-text3 text-sm">Nenhum produto encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2">
              <tr>
                <th className="text-left px-4 py-2.5">Produto</th>
                <th className="text-left px-4 py-2.5">Categoria</th>
                <th className="text-right px-4 py-2.5">Atual</th>
                <th className="text-right px-4 py-2.5">Mín.</th>
                <th className="text-right px-4 py-2.5">Custo</th>
                <th className="text-right px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const low = Number(p.qty_current) <= Number(p.qty_min);
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-bg2/40">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-navy flex items-center gap-2">
                        {p.name}
                        {low && (
                          <span className="bh-badge bg-danger/15 text-danger flex items-center gap-1">
                            <IconAlertTriangle size={11} /> mínimo
                          </span>
                        )}
                      </div>
                      <div className="text-text3 text-xs">{p.brand ?? "—"}</div>
                    </td>
                    <td className="px-4 py-2.5 text-text2">{p.category ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      <button
                        onClick={() => setHistoryOf(p)}
                        className="hover:text-gold"
                        title="Ver histórico"
                      >
                        {Number(p.qty_current)} {p.unit ?? ""}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right text-text2">
                      {Number(p.qty_min)} {p.unit ?? ""}
                    </td>
                    <td className="px-4 py-2.5 text-right text-text2">
                      {p.cost_price ? `R$ ${Number(p.cost_price).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setMoving({ product: p, type: "in" })}
                          className="p-1.5 rounded hover:bg-success/15 text-success"
                          title="Entrada"
                        >
                          <IconArrowUp size={16} />
                        </button>
                        <button
                          onClick={() => setMoving({ product: p, type: "out" })}
                          className="p-1.5 rounded hover:bg-danger/15 text-danger"
                          title="Saída"
                        >
                          <IconArrowDown size={16} />
                        </button>
                        <button
                          onClick={() => setEditing(p)}
                          className="p-1.5 rounded hover:bg-bg2 text-text2"
                          title="Editar"
                        >
                          <IconEdit size={16} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Inativar ${p.name}?`)) return;
                            const { error } = await supabase
                              .from("products")
                              .update({ active: false })
                              .eq("id", p.id);
                            if (error) return toast.error(error.message);
                            toast.success("Produto inativado");
                            load();
                          }}
                          className="p-1.5 rounded hover:bg-danger/15 text-text3 hover:text-danger"
                          title="Inativar"
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <ProductModal
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {moving && (
        <MovementModal
          product={moving.product}
          type={moving.type}
          onClose={() => setMoving(null)}
          onSaved={() => {
            setMoving(null);
            load();
          }}
        />
      )}
      {historyOf && <HistoryModal product={historyOf} onClose={() => setHistoryOf(null)} />}
      {globalHistory && <GlobalHistoryModal onClose={() => setGlobalHistory(false)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "ok" }) {
  return (
    <div className="bh-card p-5">
      <div className="text-xs uppercase text-text3">{label}</div>
      <div
        className={`font-display text-3xl ${tone === "danger" ? "text-danger" : "text-navy"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: product?.name ?? "",
    category: product?.category ?? "",
    brand: product?.brand ?? "",
    unit: product?.unit ?? "un",
    qty_current: product?.qty_current ?? 0,
    qty_min: product?.qty_min ?? 0,
    cost_price: product?.cost_price ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.name.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const payload = {
      ...f,
      qty_current: Number(f.qty_current) || 0,
      qty_min: Number(f.qty_min) || 0,
      cost_price: f.cost_price === "" ? null : Number(f.cost_price),
      category: f.category || null,
      brand: f.brand || null,
    };
    const { error } = product
      ? await supabase.from("products").update(payload).eq("id", product.id)
      : await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(product ? "Produto atualizado" : "Produto criado");
    onSaved();
  };

  return (
    <Modal title={product ? "Editar produto" : "Novo produto"} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nome*">
          <input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            className={inp}
          />
        </Field>
        <Field label="Marca">
          <input
            value={f.brand}
            onChange={(e) => setF({ ...f, brand: e.target.value })}
            className={inp}
          />
        </Field>
        <Field label="Categoria">
          <input
            value={f.category}
            onChange={(e) => setF({ ...f, category: e.target.value })}
            className={inp}
          />
        </Field>
        <Field label="Unidade">
          <input
            value={f.unit}
            onChange={(e) => setF({ ...f, unit: e.target.value })}
            placeholder="un, ml, g, kg"
            className={inp}
          />
        </Field>
        <Field label="Qtd. atual">
          <input
            type="number"
            value={f.qty_current}
            onChange={(e) => setF({ ...f, qty_current: e.target.value as never })}
            className={inp}
          />
        </Field>
        <Field label="Qtd. mínima (alerta)">
          <input
            type="number"
            value={f.qty_min}
            onChange={(e) => setF({ ...f, qty_min: e.target.value as never })}
            className={inp}
          />
        </Field>
        <Field label="Preço de custo (R$)">
          <input
            type="number"
            step="0.01"
            value={f.cost_price as never}
            onChange={(e) => setF({ ...f, cost_price: e.target.value as never })}
            className={inp}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2">
          Cancelar
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-navy text-white font-semibold disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}

function MovementModal({
  product,
  type,
  onClose,
  onSaved,
}: {
  product: Product;
  type: "in" | "out";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [takenBy, setTakenBy] = useState("");
  const defaultCost = type === "in"
    ? ((Number(product.cost_price ?? 0) || 0) * 0).toFixed(2)
    : "";
  const [costTotal, setCostTotal] = useState(defaultCost);
  const [createExpense, setCreateExpense] = useState(type === "in");
  const [saving, setSaving] = useState(false);

  // Atualiza custo total automaticamente conforme qty muda (mas o usuário pode editar)
  useEffect(() => {
    if (type !== "in") return;
    const q = Number(qty);
    const cp = Number(product.cost_price ?? 0);
    if (q > 0 && cp > 0) {
      setCostTotal((prev) => {
        // Só sobrescreve se ainda estava em branco/zero ou foi alterado por este efeito
        if (!prev || prev === "0.00" || prev === "0") return (q * cp).toFixed(2);
        return prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty]);

  const save = async () => {
    const q = Number(qty);
    if (!q || q <= 0) return toast.error("Quantidade inválida");
    if (type === "out" && q > Number(product.qty_current))
      return toast.error("Quantidade maior que o estoque atual");
    if (type === "out" && !takenBy.trim())
      return toast.error("Informe quem retirou o produto");
    const ct = type === "in" ? Number(costTotal.replace(",", ".")) : 0;
    if (type === "in" && createExpense && (!ct || ct <= 0))
      return toast.error("Informe o custo total da compra");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const delta = type === "in" ? q : -q;
    const newQty = Number(product.qty_current) + delta;

    // 1) Se for entrada e o checkbox estiver marcado, cria a despesa primeiro
    let expenseId: string | null = null;
    if (type === "in" && createExpense) {
      const today = new Date().toISOString().slice(0, 10);
      const desc = `Compra de estoque: ${q} ${product.unit ?? ""} de ${product.name}`.trim();
      const exp = await supabase.from("expenses").insert({
        category: "Estoque",
        description: desc,
        amount: ct,
        date: today,
      }).select("id").single();
      if (exp.error) {
        setSaving(false);
        return toast.error(`Erro ao lançar despesa: ${exp.error.message}`);
      }
      expenseId = exp.data?.id ?? null;
    }

    const mv = await supabase.from("stock_movements").insert({
      product_id: product.id,
      type,
      quantity: q,
      reason: reason || null,
      notes: notes || null,
      taken_by: takenBy.trim() || null,
      created_by: u.user?.id ?? null,
      cost_total: type === "in" && ct > 0 ? ct : null,
      expense_id: expenseId,
    });
    if (mv.error) {
      setSaving(false);
      // rollback da despesa se criada
      if (expenseId) await supabase.from("expenses").delete().eq("id", expenseId);
      return toast.error(mv.error.message);
    }
    const up = await supabase
      .from("products")
      .update({ qty_current: newQty })
      .eq("id", product.id);
    setSaving(false);
    if (up.error) return toast.error(up.error.message);
    toast.success(
      type === "in"
        ? createExpense ? "Entrada registrada e despesa lançada" : "Entrada registrada"
        : "Saída registrada"
    );
    onSaved();
  };


  return (
    <Modal
      title={`${type === "in" ? "Entrada" : "Saída"} — ${product.name}`}
      onClose={onClose}
    >
      <div className="text-sm text-text2 mb-3">
        Estoque atual: <strong>{Number(product.qty_current)} {product.unit ?? ""}</strong>
      </div>
      <div className="space-y-3">
        <Field label="Quantidade*">
          <input
            autoFocus
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={inp}
          />
        </Field>
        <Field label="Motivo">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inp}>
            <option value="">Selecione...</option>
            {type === "in" ? (
              <>
                <option value="compra">Compra</option>
                <option value="ajuste">Ajuste de inventário</option>
                <option value="devolucao">Devolução</option>
              </>
            ) : (
              <>
                <option value="uso">Uso em procedimento</option>
                <option value="perda">Perda / quebra</option>
                <option value="ajuste">Ajuste de inventário</option>
              </>
            )}
          </select>
        </Field>
        <Field label={type === "out" ? "Quem retirou*" : "Recebido por"}>
          <input
            value={takenBy}
            onChange={(e) => setTakenBy(e.target.value)}
            placeholder={type === "out" ? "Nome de quem retirou" : "Nome de quem recebeu"}
            className={inp}
          />
        </Field>
        <Field label="Observações">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inp}
          />
        </Field>
        {type === "in" && (
          <>
            <Field label="Custo total da compra (R$)">
              <input
                type="number"
                step="0.01"
                value={costTotal}
                onChange={(e) => setCostTotal(e.target.value)}
                placeholder="0,00"
                className={inp}
              />
              <div className="text-xs text-text3 mt-1">
                Sugestão: {Number(qty || 0)} × {Number(product.cost_price ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} = {(Number(qty || 0) * Number(product.cost_price ?? 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm text-navy bg-bg2 rounded-lg px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createExpense}
                onChange={(e) => setCreateExpense(e.target.checked)}
              />
              <span>💰 Lançar como despesa no Financeiro (categoria <b>Estoque</b>)</span>
            </label>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text2">
          Cancelar
        </button>
        <button
          onClick={save}
          disabled={saving}
          className={`px-5 py-2 rounded-lg text-white font-semibold disabled:opacity-60 ${type === "in" ? "bg-success" : "bg-danger"}`}
        >
          {saving ? "Salvando..." : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}

function HistoryModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("product_id", product.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setRows((data as never) ?? []);
      setLoading(false);
    })();
  }, [product.id]);

  return (
    <Modal title={`Histórico — ${product.name}`} onClose={onClose}>
      {loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : rows.length === 0 ? (
        <div className="text-center text-text3 text-sm py-6">Sem movimentações.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-bg2 text-text2">
            <tr>
              <th className="text-left px-3 py-2">Data</th>
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-right px-3 py-2">Qtd</th>
              <th className="text-left px-3 py-2">Motivo</th>
              <th className="text-left px-3 py-2">Quem retirou/recebeu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-text2">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`bh-badge ${r.type === "in" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
                  >
                    {r.type === "in" ? "Entrada" : "Saída"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-semibold">
                  {r.type === "in" ? "+" : "−"}
                  {Number(r.quantity)}
                </td>
                <td className="px-3 py-2 text-text2">{r.reason ?? "—"}</td>
                <td className="px-3 py-2 text-text2">{r.taken_by ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function GlobalHistoryModal({ onClose }: { onClose: () => void }) {
  type Row = Movement & { products: { name: string; unit: string | null } | null };
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "in" | "out">("all");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, unit)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) toast.error(error.message);
      setRows(((data as unknown) as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    let r = rows;
    if (filterType !== "all") r = r.filter((x) => x.type === filterType);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (x) =>
          (x.products?.name ?? "").toLowerCase().includes(q) ||
          (x.taken_by ?? "").toLowerCase().includes(q) ||
          (x.reason ?? "").toLowerCase().includes(q),
      );
    }
    return r;
  }, [rows, search, filterType]);

  return (
    <Modal title="Histórico de movimentações" onClose={onClose}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto, motivo ou pessoa..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border text-sm"
          />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`px-3 py-2 ${filterType === "all" ? "bg-navy text-white" : "bg-card text-text2 hover:bg-bg2"}`}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setFilterType("in")}
            className={`px-3 py-2 ${filterType === "in" ? "bg-success text-white" : "bg-card text-text2 hover:bg-bg2"}`}
          >
            Entradas
          </button>
          <button
            type="button"
            onClick={() => setFilterType("out")}
            className={`px-3 py-2 ${filterType === "out" ? "bg-danger text-white" : "bg-card text-text2 hover:bg-bg2"}`}
          >
            Saídas
          </button>
        </div>
      </div>
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : filtered.length === 0 ? (
        <div className="text-center text-text3 text-sm py-6">Sem movimentações.</div>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg2 text-text2 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Produto</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-right px-3 py-2">Qtd</th>
                <th className="text-left px-3 py-2">Motivo</th>
                <th className="text-left px-3 py-2">Quem retirou/recebeu</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 text-text2 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-3 py-2 font-semibold text-navy">{r.products?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`bh-badge ${r.type === "in" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
                    >
                      {r.type === "in" ? "Entrada" : "Saída"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {r.type === "in" ? "+" : "−"}
                    {Number(r.quantity)} {r.products?.unit ?? ""}
                  </td>
                  <td className="px-3 py-2 text-text2">{r.reason ?? "—"}</td>
                  <td className="px-3 py-2 text-text2">{r.taken_by ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

const inp = "w-full px-3 py-2 rounded-lg border border-border text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display text-xl text-navy">{title}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg2 text-text3">
            <IconX size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
