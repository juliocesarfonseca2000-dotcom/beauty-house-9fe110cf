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

  // Logo no canto superior direito
  if (opts.logoUrl) {
    try {
      const response = await fetch(opts.logoUrl);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      doc.addImage(base64, "PNG", 160, 8, 22, 22);
    } catch { /* ignora */ }
  }

  // Cabeçalho clínica
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(opts.clinicName || "Est. Beauty House Medicina e Estética", 20, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`CNPJ: ${opts.clinicCnpj || "68.438.126/0001-86"}`, 20, 25);
  doc.text(opts.clinicAddress || "Rua Pamplona, 925 — Jd. Paulista, São Paulo", 20, 31);
  doc.line(20, 36, 190, 36);

  // Dados do cliente
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Termo de Consentimento Informado", 20, 44);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Cliente: ${opts.clientName}`, 20, 52);
  if (opts.clientCpf) doc.text(`CPF: ${opts.clientCpf}`, 20, 58);
  if (opts.clientPhone) doc.text(`Telefone: ${opts.clientPhone}`, 20, 64);
  doc.text(`Procedimento: ${opts.procName}`, 20, 70);
  doc.text(`Data: ${new Date(opts.signedAt).toLocaleDateString("pt-BR")}`, 20, 76);
  doc.line(20, 80, 190, 80);

  // Texto do termo
  const lines = doc.splitTextToSize(opts.termText, 170);
  let yPos = 88;
  doc.text(lines, 20, yPos);
  yPos += lines.length * 5 + 15;

  // Assinatura abaixo do texto (não em posição fixa)
  if (yPos > 230) { doc.addPage(); yPos = 20; }
  if (opts.signatureDataUrl) {
    doc.addImage(opts.signatureDataUrl, "PNG", 20, yPos - 22, 80, 20);
  }
  doc.line(20, yPos, 100, yPos);
  doc.text("Assinatura da Cliente", 20, yPos + 6);

  return doc.output("blob");
}
