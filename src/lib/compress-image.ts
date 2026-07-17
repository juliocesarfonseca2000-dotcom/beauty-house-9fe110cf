/**
 * Compressão de imagens antes do upload das FOTOS DAS CLIENTES.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ESCOPO — o que este arquivo afeta:
 *   ✔ Somente o upload da aba "Fotos" da ficha da cliente (PhotosTab).
 *
 * O que este arquivo NÃO afeta (continuam exatamente como estão):
 *   ✘ Assinaturas (sessões e prontuário)
 *   ✘ PDFs de termos, contratos e prontuários
 *   ✘ Ficha Antiga (imagens escaneadas)
 *   ✘ Agenda, Financeiro, Estoque, Lembretes, Prontuário
 * ─────────────────────────────────────────────────────────────────────
 *
 * SEGURANÇA — esta função NUNCA impede o envio de uma foto.
 * Em qualquer situação fora do esperado, ela devolve o arquivo ORIGINAL
 * e o upload segue normalmente, como era antes:
 *   1. Arquivo não é imagem            -> devolve original
 *   2. Imagem já é pequena             -> devolve original
 *   3. Navegador sem suporte a canvas  -> devolve original
 *   4. Falha ao gerar o JPEG           -> devolve original
 *   5. Comprimida ficou maior          -> devolve original
 *   6. Qualquer erro inesperado        -> try/catch devolve original
 * O pior cenário possível é a foto subir do mesmo jeito que subia antes.
 * Não existe caminho em que a foto se perca.
 *
 * MOTIVO: fotos de celular chegam com 3–8 MB. Para acompanhamento
 * clínico, 1600px no lado maior com qualidade 80% mantém a nitidez
 * necessária e reduz o arquivo em ~10x, economizando armazenamento
 * e tráfego (que haviam estourado o limite do plano).
 */

const MAX_SIDE = 1600;
const QUALITY = 0.8;

export async function compressImage(
  file: File,
  opts?: { maxSide?: number; quality?: number }
): Promise<File> {
  const maxSide = opts?.maxSide ?? MAX_SIDE;
  const quality = opts?.quality ?? QUALITY;

  // [Proteção 1] Não é imagem: devolve como veio
  if (!file.type.startsWith("image/")) return file;

  try {
    // imageOrientation: "from-image" respeita a orientação EXIF,
    // senão fotos tiradas na vertical saem deitadas.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const { width, height } = bitmap;
    const maior = Math.max(width, height);

    // [Proteção 2] Já é pequena e é JPEG: não mexe
    if (maior <= maxSide && file.type === "image/jpeg" && file.size < 500_000) {
      bitmap.close();
      return file;
    }

    const escala = maior > maxSide ? maxSide / maior : 1;
    const w = Math.round(width * escala);
    const h = Math.round(height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    // [Proteção 3] Navegador sem canvas: devolve original
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );

    // [Proteção 4] Falhou ao gerar o JPEG: devolve original
    if (!blob) return file;

    // [Proteção 5] Ficou maior que o original: devolve original
    if (blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // [Proteção 6] Qualquer erro inesperado: envia o original.
    // Nunca deixa de enviar a foto por causa da compressão.
    return file;
  }
}

/** Formata bytes para exibição (ex: "3.2 MB") */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
