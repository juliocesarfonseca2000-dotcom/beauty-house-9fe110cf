import { jsPDF } from "jspdf";

export async function generateTermPdf(opts: {
  clientName: string;
  clientCpf?: string | null;
  clientPhone?: string | null;
  procName: string;
  termText: string;
  signatureDataUrl: string;
  signedAt: string;
  logoUrl?: string | null;
  clinicName?: string;
  clinicAddress?: string;
  clinicCnpj?: string;
}): Promise<Blob> {
  const doc = new jsPDF();
  const pageH = doc.internal.pageSize.getHeight(); // 297mm
  const pageW = doc.internal.pageSize.getWidth();  // 210mm

  // ── Logo via canvas (sem CORS) ──────────────────────────────────────────
  if (opts.logoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve(); // ignora erro — continua sem logo
        img.src = opts.logoUrl!;
      });
      if (img.naturalWidth > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        doc.addImage(canvas.toDataURL("image/png"), "PNG", pageW - 35, 6, 22, 22);
      }
    } catch { /* ignora */ }
  }

  // ── Cabeçalho clínica ───────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(opts.clinicName || "Est. Beauty House Medicina e Estética", 20, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`CNPJ: ${opts.clinicCnpj || "68.438.126/0001-86"}`, 20, 23);
  doc.text(opts.clinicAddress || "Rua Pamplona, 925 — Jd. Paulista, São Paulo", 20, 29);
  doc.setTextColor(0);
  doc.line(20, 33, 190, 33);

  // ── Título e dados do cliente ───────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Termo de Consentimento Informado", 20, 41);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  let cy = 49;
  doc.text(`Cliente: ${opts.clientName}`, 20, cy);
  if (opts.clientCpf)   { cy += 6; doc.text(`CPF: ${opts.clientCpf}`, 20, cy); }
  if (opts.clientPhone) { cy += 6; doc.text(`Telefone: ${opts.clientPhone}`, 20, cy); }
  cy += 6; doc.text(`Procedimento: ${opts.procName}`, 20, cy);
  cy += 6; doc.text(`Data: ${new Date(opts.signedAt).toLocaleDateString("pt-BR")}`, 20, cy);
  cy += 4; doc.line(20, cy, 190, cy);

  // ── Texto do termo (com paginação automática) ───────────────────────────
  const lineHeight = 5;
  const marginBottom = 50; // reserva 50mm no rodapé para a assinatura
  const usableH = pageH - marginBottom;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const allLines = doc.splitTextToSize(opts.termText, 170) as string[];
  let y = cy + 8;

  for (const line of allLines) {
    if (y + lineHeight > usableH) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, 20, y);
    y += lineHeight;
  }

  // ── Assinatura — sempre no rodapé da última página ──────────────────────
  if (y > pageH - 48) {
    doc.addPage();
    y = 20;
  }

  const sigAreaTop = pageH - 44; // 44mm do fundo
  const sigImgTop  = sigAreaTop - 2;
  const sigLineY   = sigImgTop + 22;
  const sigLabelY  = sigLineY + 6;

  if (opts.signatureDataUrl) {
    doc.addImage(opts.signatureDataUrl, "PNG", 20, sigImgTop, 80, 20);
  }
  doc.line(20, sigLineY, 110, sigLineY);
  doc.setFontSize(9);
  doc.text("Assinatura da Cliente", 20, sigLabelY);

  return doc.output("blob");
}
