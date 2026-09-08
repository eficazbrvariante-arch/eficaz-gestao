/**
 * Compressão de imagem no navegador, ANTES de subir pro Blob.
 *
 * Motivo (incidente de 08/09/2026): `ImageUploadField`/`MultiImageUploadField`
 * subiam o `File` cru da câmera. Resultado: 392 fotos de produto ocupando
 * 643MB (média de 1,6MB cada), estourando a cota de 1GB do Blob e derrubando
 * TODA escrita — inclusive a selfie do Ponto, que nem era a culpada (339
 * selfies somavam só 30MB, porque `selfie-capture-field` já comprimia).
 *
 * Uma foto de vitrine não precisa de 4000px: o maior uso hoje é um card de
 * ~400px de largura em tela retina. 2000px de lado maior deixa margem
 * confortável pra zoom e pra documento continuar legível (o mesmo campo
 * também envia documento do Crédito Eficaz), e ainda corta ~85% do peso.
 */

const DEFAULT_MAX_DIMENSION = 2000;
const DEFAULT_QUALITY = 0.82;

export type CompressResult = {
  file: File;
  /** `true` quando o arquivo original foi mantido (ver motivos em `compressImage`). */
  untouched: boolean;
};

/** GIF pode ser animado, e canvas achata pro primeiro quadro — não mexer. */
function isAnimatableType(type: string) {
  return type === "image/gif";
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // `imageOrientation: "from-image"` respeita o EXIF — sem isso, foto tirada
  // de lado no celular sobe girada.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari antigo não aceita o segundo argumento — cai no <img> abaixo,
      // que já aplica a orientação do EXIF por conta própria.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("imagem ilegível"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlobAsync(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function renameTo(fileName: string, mimeType: string) {
  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  // Troca só a última extensão: "foto.da.vitrine.png" -> "foto.da.vitrine.webp".
  return `${fileName.replace(/\.[^.]+$/, "")}.${ext}`;
}

/**
 * Reduz a imagem para caber em `maxDimension` e recomprime.
 *
 * Devolve o arquivo ORIGINAL (com `untouched: true`) quando comprimir não
 * ajudaria ou seria destrutivo: GIF (animação), falha de decodificação, ou
 * resultado maior que o original (comum em imagem já otimizada). Nunca lança
 * — o pior caso é o comportamento antigo, subir o arquivo como veio.
 */
export async function compressImage(
  file: File,
  {
    maxDimension = DEFAULT_MAX_DIMENSION,
    quality = DEFAULT_QUALITY,
  }: { maxDimension?: number; quality?: number } = {}
): Promise<CompressResult> {
  if (!file.type.startsWith("image/") || isAnimatableType(file.type)) {
    return { file, untouched: true };
  }

  try {
    const source = await loadBitmap(file);
    const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!width || !height) return { file, untouched: true };

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, untouched: true };
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if ("close" in source) source.close();

    // PNG pode ter fundo transparente, e JPEG não guarda alpha (viraria preto).
    // WebP guarda alpha e comprime melhor que PNG; se o navegador não gerar
    // WebP, `toBlob` cai pra PNG sozinho e a checagem de tamanho lá embaixo
    // decide se ainda vale a pena.
    const preferWebp = file.type === "image/png" || file.type === "image/webp";
    const targetType = preferWebp ? "image/webp" : "image/jpeg";

    const blob = await toBlobAsync(canvas, targetType, quality);
    if (!blob || blob.size >= file.size) return { file, untouched: true };

    const mimeType = blob.type || targetType;
    return {
      file: new File([blob], renameTo(file.name, mimeType), {
        type: mimeType,
        lastModified: Date.now(),
      }),
      untouched: false,
    };
  } catch {
    return { file, untouched: true };
  }
}
