import { jsPDF } from "jspdf";

export async function generateProntuarioPdf(opts: {
  clientName: string;
  clientCpf?: string | null;
  clientRecordNum?: number | null;
  procName: string;
  date: string;
  equipment?: string | null;
  parameters?: string | null;
  notes?: string | null;
  doctorSignature?: string | null;
  patientSignature?: string | null;
  doctorName?: string | null;
  doctorCrm?: string | null;
  doctorSpecialty?: string | null;
  signedAt?: string | null;
  clinicName?: string;
  clinicAddress?: string;
  clinicCnpj?: string;
}): Promise<Blob> {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(opts.clinicName || "Est. Beauty House Medicina e Estética", 20, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`CNPJ: ${opts.clinicCnpj || "68.438.126/0001-86"}`, 20, 23);
  doc.text(opts.clinicAddress || "Rua Pamplona, 925 — Jd. Paulista, São Paulo", 20, 29);

  doc.setDrawColor(169, 128, 63);
  doc.setLineWidth(0.5);
  doc.line(20, 33, pageW - 20, 33);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Prontuário Médico", 20, 42);
  doc.setFont("helvetica", "normal");

  doc.setFontSize(9);
  let cy = 52;
  const fichaTxt = opts.clientRecordNum ? ` (Ficha #${opts.clientRecordNum})` : "";
  doc.text(`Paciente: ${opts.clientName}${fichaTxt}`, 20, cy);
  if (opts.clientCpf) { cy += 6; doc.text(`CPF: ${opts.clientCpf}`, 20, cy); }
  cy += 6; doc.text(`Procedimento: ${opts.procName}`, 20, cy);
  cy += 6; doc.text(`Data do atendimento: ${new Date(opts.date + "T12:00:00").toLocaleDateString("pt-BR")}`, 20, cy);

  cy += 8;
  doc.setDrawColor(220, 220, 220);
  doc.line(20, cy, pageW - 20, cy);
  cy += 8;

  const field = (label: string, value?: string | null) => {
    if (!value || !value.trim()) return;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, 20, cy);
    cy += 5;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value, pageW - 40) as string[];
    lines.forEach((line) => {
      if (cy > 240) { doc.addPage(); cy = 20; }
      doc.text(line, 20, cy);
      cy += 5;
    });
    cy += 3;
  };

  field("Equipamento:", opts.equipment);
  field("Parâmetros:", opts.parameters);
  field("Evolução / Anotações:", opts.notes);

  if (cy > 195) { doc.addPage(); cy = 30; }

  const sigTop = Math.max(cy + 10, 205);
  const colL = 20;
  const colR = pageW / 2 + 5;

  if (opts.doctorSignature) {
    try { doc.addImage(opts.doctorSignature, "PNG", colL, sigTop, 70, 18); } catch { /* ignora */ }
  }
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.2);
  doc.line(colL, sigTop + 20, colL + 70, sigTop + 20);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Assinatura do Médico", colL, sigTop + 24);

  const stampY = sigTop + 28;
  const stampH = 20;
  doc.setDrawColor(31, 51, 73);
  doc.setLineWidth(0.4);
  doc.rect(colL, stampY, 70, stampH);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(opts.doctorName || "—", colL + 3, stampY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  if (opts.doctorCrm) doc.text(opts.doctorCrm, colL + 3, stampY + 11.5);
  if (opts.doctorSpecialty) doc.text(opts.doctorSpecialty, colL + 3, stampY + 16.5);

  if (opts.patientSignature) {
    try { doc.addImage(opts.patientSignature, "PNG", colR, sigTop, 70, 18); } catch { /* ignora */ }
  }
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.2);
  doc.line(colR, sigTop + 20, colR + 70, sigTop + 20);
  doc.setFontSize(8);
  doc.text("Assinatura do Paciente", colR, sigTop + 24);
  doc.setFontSize(7.5);
  doc.text(opts.clientName, colR, sigTop + 29);

  if (opts.signedAt) {
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `Documento assinado eletronicamente em ${new Date(opts.signedAt).toLocaleString("pt-BR")}`,
      20, 285
    );
    doc.setTextColor(0, 0, 0);
  }

  return doc.output("blob");
}
