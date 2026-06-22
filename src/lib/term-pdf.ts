import { jsPDF } from "jspdf";

export async function generateTermPdf(opts: {
  clientName: string;
  procName: string;
  termText: string;
  signatureDataUrl: string;
  signedAt: string;
}): Promise<Blob> {
  const { clientName, procName, termText, signatureDataUrl, signedAt } = opts;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Est. Beauty House Medicina e Estética", 20, 20);
  doc.setFontSize(11);
  doc.text("CNPJ: 68.438.126/0001-86", 20, 30);
  doc.text("Rua Pamplona, 925 — Jd. Paulista, São Paulo", 20, 38);
  doc.line(20, 44, 190, 44);
  doc.setFontSize(13);
  doc.text("Termo de Consentimento", 20, 54);
  doc.setFontSize(10);
  doc.text(`Cliente: ${clientName}`, 20, 65);
  doc.text(`Procedimento: ${procName}`, 20, 73);
  const dateStr = new Date(signedAt).toLocaleDateString("pt-BR");
  doc.text(`Data: ${dateStr}`, 20, 81);
  doc.line(20, 87, 190, 87);
  const lines = doc.splitTextToSize(termText, 170);
  doc.text(lines, 20, 97);
  if (signatureDataUrl) {
    doc.addImage(signatureDataUrl, "PNG", 20, 200, 80, 25);
  }
  doc.text("Assinatura da Cliente", 20, 230);
  return doc.output("blob");
}
