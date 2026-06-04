import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Income = { date: string; description: string | null; pay_method: string | null; amount: number };
type Expense = { date: string; category: string | null; description: string | null; amount: number };

export function exportFinanceiroPdf(opts: {
  fromLabel: string;
  toLabel: string;
  includeIncome: boolean;
  includeExpenses: boolean;
  includeResult: boolean;
  incomes: Income[];
  expenses: Expense[];
}) {
  const { fromLabel, toLabel, includeIncome, includeExpenses, includeResult, incomes, expenses } = opts;
  const doc = new jsPDF();
  const totalIn = incomes.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalOut = expenses.reduce((s, i) => s + Number(i.amount || 0), 0);

  // header
  doc.setFontSize(18);
  doc.setTextColor(18, 40, 63);
  doc.text("Beauty House — Relatório Financeiro", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Período: ${fromLabel} → ${toLabel}`, 14, 26);

  let y = 34;

  if (includeIncome) {
    doc.setFontSize(13);
    doc.setTextColor(18, 40, 63);
    doc.text("Receitas", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Data", "Descrição", "Pagamento", "Valor"]],
      body: incomes.map((i) => [
        new Date(i.date).toLocaleDateString("pt-BR"),
        i.description ?? "—",
        i.pay_method ?? "—",
        `R$ ${Number(i.amount).toFixed(2)}`,
      ]),
      foot: [["", "", "Total", `R$ ${totalIn.toFixed(2)}`]],
      theme: "striped",
      headStyles: { fillColor: [18, 40, 63] },
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
      styles: { fontSize: 9 },
    });
    // @ts-expect-error lastAutoTable
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (includeExpenses) {
    doc.setFontSize(13);
    doc.setTextColor(18, 40, 63);
    doc.text("Despesas", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Data", "Categoria", "Descrição", "Valor"]],
      body: expenses.map((e) => [
        new Date(e.date).toLocaleDateString("pt-BR"),
        e.category ?? "—",
        e.description ?? "—",
        `R$ ${Number(e.amount).toFixed(2)}`,
      ]),
      foot: [["", "", "Total", `R$ ${totalOut.toFixed(2)}`]],
      theme: "striped",
      headStyles: { fillColor: [184, 34, 34] },
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
      styles: { fontSize: 9 },
    });
    // @ts-expect-error lastAutoTable
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (includeResult) {
    const result = totalIn - totalOut;
    doc.setFontSize(14);
    doc.setTextColor(result >= 0 ? 0 : 184, result >= 0 ? 128 : 34, result >= 0 ? 0 : 34);
    doc.text(`Resultado líquido: R$ ${result.toFixed(2)}`, 14, y + 4);
  }

  // Gerar nome de arquivo
  const safe = `${fromLabel}_${toLabel}`.replace(/[^\dA-Za-z_-]/g, "_");
  doc.save(`financeiro_beauty_house_${safe}.pdf`);
}
