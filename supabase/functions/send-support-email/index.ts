// Edge Function: send-support-email
// Envia email ao admin via Resend e atualiza email_sent / email_sent_at / email_error
// no ticket correspondente em support_tickets.
// Secrets: RESEND_API_KEY (obrigatório), SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (auto-injetados).
import { Resend } from "npm:resend@4.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  ticket_id?: string;
  user_name?: string;
  user_email?: string;
  page?: string;
  message?: string;
  user_agent?: string;
  created_at?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function updateTicket(
  ticketId: string | undefined,
  fields: { email_sent: boolean; email_sent_at: string; email_error: string | null },
) {
  if (!ticketId) return;
  const { error } = await admin.from("support_tickets").update(fields).eq("id", ticketId);
  if (error) console.error("update support_tickets failed:", error);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const body = (await req.json().catch(() => ({}))) as Payload;
  const ticket_id = body.ticket_id;
  const nowIso = new Date().toISOString();

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      const msg = "RESEND_API_KEY not set";
      await updateTicket(ticket_id, { email_sent: false, email_sent_at: nowIso, email_error: msg });
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user_name = body.user_name ?? "—";
    const user_email = body.user_email ?? "—";
    const page = body.page ?? "—";
    const message = body.message ?? "";
    const user_agent = body.user_agent ?? "—";
    const created_at = body.created_at ?? nowIso;

    const dateBR = new Date(created_at).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a2540">
        <h2 style="color:#1a2540;border-bottom:2px solid #c8a951;padding-bottom:8px">🐞 Novo chamado de suporte</h2>
        <p><strong>Usuário:</strong> ${esc(user_name)} (${esc(user_email)})</p>
        <p><strong>Página:</strong> ${esc(page)}</p>
        <p><strong>Data/hora:</strong> ${esc(dateBR)}</p>
        <div style="background:#f7f5ef;padding:12px;border-radius:8px;margin:16px 0">
          <strong>Mensagem:</strong><br/>
          <div style="white-space:pre-wrap;margin-top:6px">${esc(message)}</div>
        </div>
        <p style="font-size:11px;color:#888"><strong>Navegador:</strong> ${esc(user_agent)}</p>
      </div>
    `;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: "Beauty House <onboarding@resend.dev>",
      to: ["juliocesar.fonseca2000@gmail.com"],
      subject: `🐞 Beauty House - Novo chamado de ${user_name}`,
      html,
      reply_to: user_email !== "—" ? user_email : undefined,
    });

    if (error) {
      const msg = typeof error === "string" ? error : JSON.stringify(error);
      console.error("Resend error:", error);
      await updateTicket(ticket_id, { email_sent: false, email_sent_at: nowIso, email_error: msg });
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await updateTicket(ticket_id, { email_sent: true, email_sent_at: nowIso, email_error: null });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-support-email error:", e);
    await updateTicket(ticket_id, { email_sent: false, email_sent_at: nowIso, email_error: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
