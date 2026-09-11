import { code128Bars } from "@/lib/code128";

/**
 * Etiqueta do código interno do produto (só o código de barras + o código
 * escrito embaixo — nunca o EAN do fabricante), pra impressora térmica de
 * etiquetas em rolo (ex.: LELONG com rolo 33x22mm de 3 colunas).
 *
 * Cada "página" impressa é UMA linha do rolo: largura = rolo inteiro,
 * altura = uma etiqueta. A impressora avança até o próximo vão sozinha
 * (sensor de gap), então 7 etiquetas em 3 colunas = 3 páginas, a última com
 * uma etiqueta só.
 */
export type LabelConfig = {
  /** Largura de UMA etiqueta, em mm. */
  labelWidth: number;
  /** Altura de uma etiqueta, em mm. */
  labelHeight: number;
  /** Quantas etiquetas lado a lado no rolo. */
  columns: number;
  /** Espaço entre uma etiqueta e a do lado, em mm. */
  columnGap: number;
  /** Sobra do papel antes da primeira etiqueta (e depois da última), em mm. */
  sideMargin: number;
};

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  labelWidth: 33,
  labelHeight: 22,
  columns: 3,
  columnGap: 2,
  sideMargin: 1.5,
};

const LIMITS: Record<keyof LabelConfig, [number, number]> = {
  labelWidth: [15, 110],
  labelHeight: [10, 80],
  columns: [1, 5],
  columnGap: [0, 10],
  sideMargin: [0, 10],
};

export const MAX_LABELS_PER_PRINT = 300;

/** Impressora térmica de 203 dpi: 8 pontos por mm. */
const DOT_MM = 0.125;
const LABEL_PADDING_MM = 1;
const CODE_GAP_MM = 0.8;

/**
 * Normaliza a configuração vinda do navegador (localStorage/campos do
 * formulário): valor faltando ou inválido volta pro padrão, fora do limite
 * encosta no limite — nunca gera página de tamanho absurdo.
 */
export function sanitizeLabelConfig(input: Partial<Record<keyof LabelConfig, unknown>>): LabelConfig {
  const result = { ...DEFAULT_LABEL_CONFIG };
  for (const key of Object.keys(LIMITS) as (keyof LabelConfig)[]) {
    const raw = Number(input[key]);
    if (input[key] === "" || input[key] == null || !Number.isFinite(raw)) continue;
    const [min, max] = LIMITS[key];
    const clamped = Math.min(max, Math.max(min, raw));
    result[key] = key === "columns" ? Math.round(clamped) : Math.round(clamped * 10) / 10;
  }
  return result;
}

/** Tamanho do papel (uma linha do rolo) que a impressora precisa ter configurado. */
export function labelPageSize(config: LabelConfig) {
  return {
    width:
      Math.round(
        (config.sideMargin * 2 +
          config.labelWidth * config.columns +
          config.columnGap * (config.columns - 1)) *
          10
      ) / 10,
    height: config.labelHeight,
  };
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Mede o código de barras dentro da etiqueta. A largura de cada módulo
 * (a barra mais fina) é arredondada pra um número inteiro de pontos da
 * impressora — barra de 1,7 ponto sai com espessura irregular e o leitor
 * erra. `hardToScan` avisa quando nem 2 pontos por módulo couberam. A
 * sobra lateral dentro da etiqueta é curta (~1mm), mas o vão em branco entre
 * as etiquetas do rolo completa a zona de silêncio que o leitor precisa.
 */
export function layoutLabelBarcode(code: string, config: LabelConfig) {
  const { bars, totalModules } = code128Bars(code);
  const available = config.labelWidth - LABEL_PADDING_MM * 2;
  const dots = Math.min(4, Math.floor(available / (totalModules * DOT_MM)));
  const moduleMm = dots >= 1 ? dots * DOT_MM : available / totalModules;
  const widthMm = totalModules * moduleMm;

  const fontSizeMm = Math.min(3, Math.round(config.labelHeight * 0.14 * 10) / 10);
  const heightMm = Math.max(
    4,
    Math.min(15, config.labelHeight - LABEL_PADDING_MM * 2 - fontSizeMm - CODE_GAP_MM)
  );

  return {
    bars,
    totalModules,
    moduleMm,
    widthMm,
    heightMm,
    fontSizeMm,
    hardToScan: dots < 2,
  };
}

/**
 * HTML de UMA etiqueta, com todo o estilo inline — o mesmo trecho serve pra
 * pré-visualização no painel e pro documento de impressão.
 */
export function renderLabelHtml(code: string, config: LabelConfig) {
  const layout = layoutLabelBarcode(code, config);
  const rects = layout.bars
    .map((bar) => `<rect x="${bar.x}" y="0" width="${bar.width}" height="1"/>`)
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.widthMm}mm" height="${layout.heightMm}mm" ` +
    `viewBox="0 0 ${layout.totalModules} 1" preserveAspectRatio="none" shape-rendering="crispEdges" ` +
    `style="display:block;fill:#000">${rects}</svg>`;

  return (
    `<div style="box-sizing:border-box;width:${config.labelWidth}mm;height:${config.labelHeight}mm;` +
    `padding:${LABEL_PADDING_MM}mm;display:flex;flex-direction:column;align-items:center;` +
    `justify-content:center;overflow:hidden;background:#fff;color:#000">` +
    svg +
    `<div style="margin-top:${CODE_GAP_MM}mm;font:700 ${layout.fontSizeMm}mm/1 Arial,Helvetica,sans-serif;` +
    `letter-spacing:0.15mm;white-space:nowrap">${escapeHtml(code)}</div>` +
    `</div>`
  );
}

/**
 * Documento completo pra imprimir `quantity` etiquetas do mesmo código,
 * preenchendo as linhas do rolo da esquerda pra direita.
 */
export function buildLabelPrintDocument(code: string, quantity: number, config: LabelConfig) {
  const page = labelPageSize(config);
  const label = renderLabelHtml(code, config);
  const total = Math.min(MAX_LABELS_PER_PRINT, Math.max(1, Math.floor(quantity)));
  const rowCount = Math.ceil(total / config.columns);

  const rows: string[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const slots: string[] = [];
    for (let column = 0; column < config.columns; column += 1) {
      if (row * config.columns + column >= total) break;
      const left = config.sideMargin + column * (config.labelWidth + config.columnGap);
      slots.push(`<div class="slot" style="left:${left}mm">${label}</div>`);
    }
    rows.push(`<div class="row">${slots.join("")}</div>`);
  }

  // A linha fica 0,3mm mais baixa que a página: com a altura exata, o
  // arredondamento do navegador às vezes empurra uma página em branco extra
  // (= uma linha de etiquetas desperdiçada).
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Etiqueta ${escapeHtml(code)}</title>
<style>
@page { size: ${page.width}mm ${page.height}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.row { position: relative; width: ${page.width}mm; height: ${page.height - 0.3}mm; overflow: hidden; break-after: page; }
.row:last-child { break-after: auto; }
.slot { position: absolute; top: 0; }
</style>
</head>
<body>${rows.join("")}</body>
</html>`;
}
