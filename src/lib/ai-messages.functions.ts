import { createServerFn } from "@tanstack/react-start";

type GenInput = { audience: string; instruction: string };

export const generateCampaignMessage = createServerFn({ method: "POST" })
  .validator((d: GenInput) => d)
  .handler(async ({ data }): Promise<{ text: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada.");

    const sys = `Você é uma assistente de marketing de uma clínica de estética chamada Beauty House. Escreva mensagens curtas (3-6 linhas) para WhatsApp, em português brasileiro, tom simpático, acolhedor e persuasivo, com 1-2 emojis no máximo. SEMPRE use o placeholder {nome} no cumprimento. Quando fizer sentido para o público, pode usar também {pacote}, {sessoes_restantes} e {dias_sem_vir}. Não invente promoções não pedidas. Termine com um chamado para resposta no WhatsApp. Responda APENAS com o texto da mensagem, sem aspas nem cabeçalho.`;

    const userMsg = `Público: ${data.audience}\nInstrução da gerente: ${data.instruction || "(sem instrução adicional — crie uma mensagem padrão para este público)"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em alguns minutos.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Erro da IA (${res.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("A IA não retornou texto.");
    return { text };
  });
