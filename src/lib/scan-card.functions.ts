import { createServerFn } from "@tanstack/react-start";

type ScanInput = {
  frontBase64: string; // data URL or raw base64
  frontMime: string;
  backBase64?: string;
  backMime?: string;
};

export type ProcedureHistoryItem = {
  procedure_name: string;
  sessions_done: number;
  sessions_total: number | null;
};

type ScanResult = {
  name: string | null;
  phone: string | null;
  phone_commercial: string | null;
  record_num: string | null;
  evaluator_name: string | null;
  notes: string | null;
  procedures_history: ProcedureHistoryItem[];
};

function stripDataUrl(s: string) {
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + 7) : s;
}

export const scanClientCard = createServerFn({ method: "POST" })
  .inputValidator((d: ScanInput) => d)
  .handler(async ({ data }): Promise<ScanResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada.");

    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text:
          "Você está lendo uma ficha física de cliente da clínica Beauty House Estética. Extraia os campos pedidos pela função. Se algum campo não estiver visível, retorne null. Para o telefone, devolva apenas dígitos (sem máscara). O 'evaluator_name' é a avaliadora responsável (nome da profissional). 'notes' deve conter o tratamento, observações e renovações concatenados.\n\nIMPORTANTE — HISTÓRICO DE PROCEDIMENTOS:\nFichas físicas costumam ter tabelas/grades de controle de sessões (geralmente numeradas 1 a 10, ou 1 a 20) com datas, carimbos, vistos (X, ✓) ou assinaturas indicando sessões já realizadas. Para CADA procedimento/tratamento identificável na ficha, retorne um item em 'procedures_history' com:\n- procedure_name: nome do procedimento como aparece escrito (ex: 'Dermapen', 'Massagem 40min', 'Botox', 'Drenagem')\n- sessions_done: número de sessões já marcadas/realizadas (conte carimbos, vistos, datas preenchidas)\n- sessions_total: total contratado se visível (ex: pacote de 10 sessões), ou null se não houver indicação clara\n\nSe não conseguir identificar o histórico com confiança, retorne array vazio em vez de inventar números. É preferível devolver vazio a errar.",
      },
      {
        type: "image_url",
        image_url: { url: `data:${data.frontMime};base64,${stripDataUrl(data.frontBase64)}` },
      },
    ];
      {
        type: "image_url",
        image_url: { url: `data:${data.frontMime};base64,${stripDataUrl(data.frontBase64)}` },
      },
    ];
    if (data.backBase64 && data.backMime) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${data.backMime};base64,${stripDataUrl(data.backBase64)}` },
      });
    }

    const body = {
      model: "google/gemini-2.5-pro",
      messages: [{ role: "user", content }],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_client_card",
            description: "Extrai dados de uma ficha de cliente Beauty House.",
            parameters: {
              type: "object",
              properties: {
                name: { type: ["string", "null"] },
                phone: { type: ["string", "null"], description: "Telefone residencial/celular, só dígitos." },
                phone_commercial: { type: ["string", "null"], description: "Telefone comercial, só dígitos." },
                record_num: { type: ["string", "null"], description: "Número da ficha." },
                evaluator_name: { type: ["string", "null"], description: "Nome da avaliadora." },
                notes: { type: ["string", "null"], description: "Tratamento + observações + renovações." },
              },
              required: ["name", "phone", "phone_commercial", "record_num", "evaluator_name", "notes"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_client_card" } },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em alguns minutos.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Erro da IA (${res.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("A IA não retornou dados estruturados.");
    try {
      return JSON.parse(args) as ScanResult;
    } catch {
      throw new Error("Resposta da IA inválida.");
    }
  });
