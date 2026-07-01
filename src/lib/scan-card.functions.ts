import { createServerFn } from "@tanstack/react-start";

type ScanInput = {
  frontBase64: string;
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
  .validator((d: ScanInput) => d)
  .handler(async ({ data }): Promise<ScanResult> => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY não configurada.");

    const imageContent: Array<Record<string, unknown>> = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: data.frontMime,
          data: stripDataUrl(data.frontBase64),
        },
      },
    ];

    if (data.backBase64) {
      imageContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: data.backMime ?? "image/jpeg",
          data: stripDataUrl(data.backBase64),
        },
      });
    }

    imageContent.push({
      type: "text",
      text: `Você é um assistente especializado em leitura de fichas de clínicas estéticas brasileiras.
Analise a(s) imagem(ns) da ficha de cliente e extraia as informações em JSON com esta estrutura exata:
{
  "name": "nome completo da cliente ou null",
  "phone": "telefone principal só dígitos ou null",
  "phone_commercial": "telefone comercial só dígitos ou null",
  "record_num": "número da ficha ou null",
  "evaluator_name": "nome da avaliadora/médica responsável ou null",
  "notes": "tratamento, observações e renovações ou null",
  "procedures_history": [
    {
      "procedure_name": "nome do procedimento",
      "sessions_done": 0,
      "sessions_total": null
    }
  ]
}
Retorne APENAS o JSON, sem texto adicional, sem markdown.`,
    });

    const body = {
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: imageContent,
        },
      ],
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em alguns minutos.");
      if (res.status === 402) throw new Error("Créditos da API esgotados.");
      throw new Error(`Erro da IA (${res.status}): ${txt.slice(0, 200)}`);
    }

    const json = await res.json() as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = json.content?.find((c) => c.type === "text")?.text ?? "";
    if (!text) throw new Error("A IA não retornou dados.");

    try {
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as Partial<ScanResult>;
      return {
        name: parsed.name ?? null,
        phone: parsed.phone ?? null,
        phone_commercial: parsed.phone_commercial ?? null,
        record_num: parsed.record_num ?? null,
        evaluator_name: parsed.evaluator_name ?? null,
        notes: parsed.notes ?? null,
        procedures_history: Array.isArray(parsed.procedures_history) ? parsed.procedures_history : [],
      };
    } catch {
      throw new Error("Resposta da IA inválida.");
    }
  });
