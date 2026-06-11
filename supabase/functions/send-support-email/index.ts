// Edge Function: send-support-email
// Envia email para o admin quando um chamado é criado em support_tickets.
// Secret necessário: RESEND_API_KEY (configurado em Edge Function secrets).
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  user_name?: string;
  user_email?: string;
  page?: string;
  message?: string;
  user_agent?: string;
  created_at?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Payload;
    const user_name = body.user_name ?? "—";
    const user_email = body.user_email ?? "—";
    const page = body.page ?? "—";
    const message = body.message ?? "";
    const user_agent = body.user_agent ?? "—";
    const created_at = body.created_at ?? new Date().toISOString();

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
      console.error("Resend error:", error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-support-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
