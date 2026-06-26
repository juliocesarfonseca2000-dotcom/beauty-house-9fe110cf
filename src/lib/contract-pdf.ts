// Geração de contrato em PDF + utilitários de clínica/cláusulas.
import { supabase } from "@/integrations/supabase/client";

export type ClinicInfo = {
  name: string;
  cnpj: string;
  address: string;
  phone: string;
  logo_url: string | null;
};

export const DEFAULT_CLINIC: ClinicInfo = {
  name: "Beauty House",
  cnpj: "",
  address: "",
  phone: "",
  logo_url: null,
};

export const DEFAULT_CLAUSES = `1. O presente contrato tem como objeto a prestação dos serviços estéticos descritos acima, conforme cronograma a ser combinado entre as partes.

2. A CLIENTE declara estar ciente dos procedimentos e ter respondido com veracidade a anamnese realizada.

3. O pagamento será efetuado conforme forma e parcelas indicadas no contrato. A inadimplência poderá implicar a suspensão dos atendimentos.

4. Cancelamentos ou reagendamentos devem ser comunicados com no mínimo 24h de antecedência, sob pena de perda da sessão.

5. As sessões adquiridas têm validade conforme política da clínica, comunicada à cliente no ato da assinatura.

6. A clínica não se responsabiliza por reações adversas decorrentes de informações omitidas pela cliente na anamnese.

7. Fica eleito o foro da comarca da sede da clínica para dirimir quaisquer dúvidas oriundas do presente contrato.`;

export async function getClinicInfo(): Promise<ClinicInfo> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", "clinic_info").maybeSingle();
  if (!data?.value) return DEFAULT_CLINIC;
  return { ...DEFAULT_CLINIC, ...(data.value as ClinicInfo) };
}

export async function getContractClauses(): Promise<string> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", "contract_clauses").maybeSingle();
  const val = data?.value as { text?: string } | string | null;
  if (!val) return DEFAULT_CLAUSES;
  if (typeof val === "string") return val;
  return val.text ?? DEFAULT_CLAUSES;
}

export type ContractItem = {
  procedure_name: string;
  sessions: number;
  unit_price: number;
  total: number;
};

export type ContractPayload = {
  recordNum?: number | string | null;
  contractNum?: number | null;
  client: { name: string; cpf?: string | null; phone?: string | null; address?: string | null };
  clinic: ClinicInfo;
  items: ContractItem[];
  total: number;
  payment_method: string;
  installments?: number | null;
  clauses: string;
  client_signature_data?: string | null; // PNG base64
  pro_signature_data?: string | null;
  pro_name?: string | null;
  date?: string;
};

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function generateContractPdf(p: ContractPayload): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const doc = new jsPDF();
  const autoTable = (autoTableMod.default || autoTableMod) as unknown as (d: typeof doc, opts: Record<string, unknown>) => void;

  const pageWidth = doc.internal.pageSize.getWidth();
  const today = new Date(p.date ?? new Date().toISOString());
  const dateStr = today.toLocaleDateString("pt-BR");

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(p.clinic.name || "Beauty House", 14, 18);
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text("Contrato de Prestação de Serviços Estéticos", 14, 26);

  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Emitido em: ${dateStr}`, pageWidth - 14, 32, { align: "right" });
  if (p.contractNum != null) doc.text(`Contrato #${p.contractNum}`, pageWidth - 14, 37, { align: "right" });
  doc.setTextColor(0);

  // Logo no canto superior direito (via canvas para evitar CORS)
  if (p.clinic.logo_url) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = p.clinic.logo_url!;
      });
      if (img.naturalWidth > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        doc.addImage(canvas.toDataURL("image/png"), "PNG", pageWidth - 35, 4, 20, 20);
      }
    } catch { /* ignora se falhar */ }
  }

  // Dados da clínica
  let y = 36;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("CONTRATANTE (Clínica):", 14, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  if (p.clinic.cnpj) { doc.text(`CNPJ: ${p.clinic.cnpj}`, 14, y); y += 4; }
  if (p.clinic.address) { doc.text(`Endereço: ${p.clinic.address}`, 14, y); y += 4; }
  if (p.clinic.phone) { doc.text(`Telefone: ${p.clinic.phone}`, 14, y); y += 4; }

  // Dados da cliente
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.text("CONTRATANTE (Cliente):", 14, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  doc.text(`Nome: ${p.client.name}`, 14, y); y += 4;
  if (p.client.cpf) { doc.text(`CPF: ${p.client.cpf}`, 14, y); y += 4; }
  if (p.client.phone) { doc.text(`Telefone: ${p.client.phone}`, 14, y); y += 4; }
  if (p.client.address) { doc.text(`Endereço: ${p.client.address}`, 14, y); y += 4; }

  // Tabela de serviços
  y += 4;
  autoTable(doc, {
    startY: y,
    head: [["Procedimento", "Sessões", "Valor unit.", "Total"]],
    body: p.items.map((it) => [it.procedure_name, String(it.sessions), BRL(it.unit_price), BRL(it.total)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [27, 41, 81], textColor: 255 },
    foot: [["", "", "TOTAL", BRL(p.total)]],
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold" },
  });

  // @ts-expect-error lastAutoTable provided by autoTable
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  // Pagamento
  doc.setFont("helvetica", "bold");
  doc.text("Forma de pagamento:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(p.payment_method, 60, y);
  y += 5;
  if (p.installments && p.installments > 1) {
    doc.text(`Parcelas: ${p.installments}x de ${BRL(p.total / p.installments)}`, 14, y);
    y += 5;
  }

  // Cláusulas
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.text("Cláusulas contratuais:", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(p.clauses, pageWidth - 28);
  for (const line of lines) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text(line, 14, y);
    y += 4;
  }

  // Espaço pra assinaturas
  if (y > 220) { doc.addPage(); y = 20; }
  y += 10;

  const sigBoxWidth = (pageWidth - 28 - 10) / 2;
  const sigY = y;

  // Cliente
  if (p.client_signature_data) {
    try { doc.addImage(p.client_signature_data, "PNG", 14, sigY, sigBoxWidth, 25); } catch { /* ignore */ }
  }
  doc.setDrawColor(150);
  doc.line(14, sigY + 28, 14 + sigBoxWidth, sigY + 28);
  doc.setFontSize(9);
  doc.text(`Cliente: ${p.client.name}`, 14, sigY + 33);

  // Profissional
  const xPro = 14 + sigBoxWidth + 10;
  if (p.pro_signature_data) {
    try { doc.addImage(p.pro_signature_data, "PNG", xPro, sigY, sigBoxWidth, 25); } catch { /* ignore */ }
  }
  doc.line(xPro, sigY + 28, xPro + sigBoxWidth, sigY + 28);
  doc.text(`Profissional: ${p.pro_name ?? ""}`, xPro, sigY + 33);

  // Rodapé
  const footY = doc.internal.pageSize.getHeight() - 10;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`${p.clinic.name || "Beauty House"} — ${dateStr}${p.contractNum != null ? ` — Contrato #${p.contractNum}` : ""}`, pageWidth / 2, footY, { align: "center" });

  return doc.output("blob");
}

export async function getNextFichaNumber(): Promise<number> {
  const [counterRes, maxRes] = await Promise.all([
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "ficha_counter")
      .maybeSingle(),
    supabase
      .from("clients")
      .select("record_num")
      .order("record_num", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const counterVal = (counterRes.data?.value as { num?: number } | null)?.num ?? 44611;
  const maxRecord = (maxRes.data as { record_num?: number | null } | null)?.record_num ?? 0;
  const finalNext = Math.max(counterVal, maxRecord, 44611) + 1;
  await supabase
    .from("system_settings")
    .upsert({ key: "ficha_counter", value: { num: finalNext } });
  return finalNext;
}

export async function peekNextContractNumber(): Promise<number> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "contract_counter")
    .maybeSingle();
  const current = (data?.value as { num?: number } | null)?.num ?? 44626;
  return current + 1;
}

export async function getNextContractNumber(): Promise<number> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "contract_counter")
    .maybeSingle();
  const current = (data?.value as { num?: number } | null)?.num ?? 44626;
  const next = current + 1;
  await supabase
    .from("system_settings")
    .upsert({ key: "contract_counter", value: { num: next } });
  return next;
}

export async function decrementContractNumber(): Promise<void> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "contract_counter")
    .maybeSingle();
  const current = (data?.value as { num?: number } | null)?.num ?? 44627;
  if (current > 44627) {
    await supabase
      .from("system_settings")
      .upsert({ key: "contract_counter", value: { num: current - 1 } });
  }
}
