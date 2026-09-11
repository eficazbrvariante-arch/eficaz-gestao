import { describe, expect, it } from "vitest";
import {
  DEFAULT_LABEL_CONFIG,
  buildLabelPrintDocument,
  labelPageSize,
  layoutLabelBarcode,
  renderLabelHtml,
  sanitizeLabelConfig,
} from "./product-label";

describe("sanitizeLabelConfig", () => {
  it("volta pro padrão quando o valor falta ou é inválido", () => {
    expect(sanitizeLabelConfig({})).toEqual(DEFAULT_LABEL_CONFIG);
    expect(sanitizeLabelConfig({ labelWidth: "abc", columns: "" })).toEqual(DEFAULT_LABEL_CONFIG);
  });

  it("encosta nos limites e arredonda colunas", () => {
    const config = sanitizeLabelConfig({ labelWidth: 500, columns: 2.6, columnGap: -3 });
    expect(config.labelWidth).toBe(110);
    expect(config.columns).toBe(3);
    expect(config.columnGap).toBe(0);
  });
});

describe("labelPageSize", () => {
  it("rolo 33x22 de 3 colunas = papel de 106 x 22 mm", () => {
    expect(labelPageSize(DEFAULT_LABEL_CONFIG)).toEqual({ width: 106, height: 22 });
  });
});

describe("layoutLabelBarcode", () => {
  it("o código interno cabe na etiqueta de 33mm com 2 pontos por módulo", () => {
    const layout = layoutLabelBarcode("INT-000001", DEFAULT_LABEL_CONFIG);
    expect(layout.moduleMm).toBe(0.25);
    expect(layout.widthMm).toBeLessThanOrEqual(DEFAULT_LABEL_CONFIG.labelWidth - 2);
    expect(layout.hardToScan).toBe(false);
  });

  it("avisa quando o código é comprido demais pra etiqueta", () => {
    const layout = layoutLabelBarcode("CODIGO-MUITO-COMPRIDO-ABC", DEFAULT_LABEL_CONFIG);
    expect(layout.hardToScan).toBe(true);
  });
});

describe("renderLabelHtml", () => {
  it("escapa o texto do código", () => {
    const html = renderLabelHtml("A<B>&1", DEFAULT_LABEL_CONFIG);
    expect(html).toContain("A&lt;B&gt;&amp;1");
    expect(html).not.toContain("A<B>");
  });
});

describe("buildLabelPrintDocument", () => {
  const countRows = (html: string) => html.split('class="row"').length - 1;
  const countSlots = (html: string) => html.split('class="slot"').length - 1;

  it("7 etiquetas em 3 colunas = 3 linhas, a última com uma só", () => {
    const html = buildLabelPrintDocument("INT-000001", 7, DEFAULT_LABEL_CONFIG);
    expect(countRows(html)).toBe(3);
    expect(countSlots(html)).toBe(7);
    expect(html).toContain("size: 106mm 22mm");
  });

  it("nunca imprime menos de 1 nem mais que o limite", () => {
    expect(countSlots(buildLabelPrintDocument("INT-000001", 0, DEFAULT_LABEL_CONFIG))).toBe(1);
    expect(countSlots(buildLabelPrintDocument("INT-000001", 10_000, DEFAULT_LABEL_CONFIG))).toBe(300);
  });
});
