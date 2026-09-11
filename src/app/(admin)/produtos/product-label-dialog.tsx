"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Code128Error } from "@/lib/code128";
import {
  DEFAULT_LABEL_CONFIG,
  MAX_LABELS_PER_PRINT,
  buildLabelPrintDocument,
  labelPageSize,
  layoutLabelBarcode,
  renderLabelHtml,
  sanitizeLabelConfig,
  type LabelConfig,
} from "@/modules/products/product-label";
import { ensureInternalCodeAction } from "./actions";

export type LabelTarget = { id: string; name: string; internalCode: string | null };

/** Medidas do rolo ficam salvas por navegador — cada computador tem a sua impressora. */
const STORAGE_KEY = "eficaz:etiqueta-config:v1";
const PRINT_FRAME_ID = "eficaz-label-print-frame";

const CONFIG_FIELDS: { key: keyof LabelConfig; label: string; step: string }[] = [
  { key: "labelWidth", label: "Largura da etiqueta (mm)", step: "0.5" },
  { key: "labelHeight", label: "Altura da etiqueta (mm)", step: "0.5" },
  { key: "columns", label: "Etiquetas por linha", step: "1" },
  { key: "columnGap", label: "Espaço entre etiquetas (mm)", step: "0.5" },
  { key: "sideMargin", label: "Margem lateral do rolo (mm)", step: "0.5" },
];

type ConfigDraft = Record<keyof LabelConfig, string>;

function toDraft(config: LabelConfig): ConfigDraft {
  return {
    labelWidth: String(config.labelWidth),
    labelHeight: String(config.labelHeight),
    columns: String(config.columns),
    columnGap: String(config.columnGap),
    sideMargin: String(config.sideMargin),
  };
}

function loadSavedConfig(): LabelConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeLabelConfig(JSON.parse(raw)) : DEFAULT_LABEL_CONFIG;
  } catch {
    return DEFAULT_LABEL_CONFIG;
  }
}

function saveConfig(config: LabelConfig) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Navegador sem localStorage: imprime do mesmo jeito, só não lembra as medidas.
  }
}

/**
 * Imprime por um iframe escondido com um documento só das etiquetas — o
 * tamanho da página (uma linha do rolo) não briga com o `@page` do cupom de
 * 80mm nem com o layout do painel, e nada além das etiquetas sai no papel.
 */
function printDocument(html: string) {
  document.getElementById(PRINT_FRAME_ID)?.remove();
  const iframe = document.createElement("iframe");
  iframe.id = PRINT_FRAME_ID;
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  iframe.onload = () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) return;
    frameWindow.addEventListener("afterprint", () => setTimeout(() => iframe.remove(), 0));
    frameWindow.focus();
    frameWindow.print();
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

/**
 * Imprime a etiqueta do CÓDIGO INTERNO do produto (nunca o EAN do
 * fabricante). Produto sem código interno: oferece gerar na hora — o código
 * já fica gravado no produto antes de liberar a impressão.
 */
export function ProductLabelDialog({
  target,
  onClose,
  onCodeGenerated,
}: {
  target: LabelTarget | null;
  onClose: () => void;
  onCodeGenerated?: (code: string) => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title="Imprimir etiqueta"
      description={target?.name}
      className="max-w-lg"
    >
      {target && (
        <LabelDialogBody
          key={target.id}
          target={target}
          onClose={onClose}
          onCodeGenerated={onCodeGenerated}
        />
      )}
    </Dialog>
  );
}

function LabelDialogBody({
  target,
  onClose,
  onCodeGenerated,
}: {
  target: LabelTarget;
  onClose: () => void;
  onCodeGenerated?: (code: string) => void;
}) {
  const [code, setCode] = useState(target.internalCode);
  const [draft, setDraft] = useState<ConfigDraft>(() => toDraft(loadSavedConfig()));
  const [quantity, setQuantity] = useState(() => draft.columns);
  const [showSettings, setShowSettings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string>();

  const config = sanitizeLabelConfig(draft);
  const page = labelPageSize(config);
  const quantityNumber = Math.floor(Number(quantity));
  const quantityValid =
    Number.isFinite(quantityNumber) && quantityNumber >= 1 && quantityNumber <= MAX_LABELS_PER_PRINT;

  let preview: { html: string; hardToScan: boolean } | null = null;
  let codeError: string | undefined;
  if (code) {
    try {
      preview = {
        html: renderLabelHtml(code, config),
        hardToScan: layoutLabelBarcode(code, config).hardToScan,
      };
    } catch (err) {
      codeError = err instanceof Code128Error ? err.message : "Código inválido para etiqueta.";
    }
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(undefined);
    try {
      const result = await ensureInternalCodeAction(target.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCode(result.code);
      onCodeGenerated?.(result.code);
    } catch {
      setError("Não foi possível gerar o código. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handlePrint() {
    if (!code || !preview || !quantityValid) return;
    saveConfig(config);
    printDocument(buildLabelPrintDocument(code, quantityNumber, config));
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {!code ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm">
          <p className="font-medium text-foreground">Este produto ainda não tem código interno.</p>
          <p className="mt-1 text-text-muted">
            Gere agora: o código fica salvo no produto e depois é só imprimir a etiqueta.
          </p>
          <Button
            type="button"
            variant="brand"
            fullWidth={false}
            className="mt-3"
            disabled={isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? "Gerando..." : "Gerar código interno"}
          </Button>
        </div>
      ) : (
        <>
          <div>
            <p className="text-sm text-text-muted">
              Código interno: <span className="font-semibold text-foreground">{code}</span>
            </p>
            {codeError ? (
              <p className="mt-2 text-sm text-danger">{codeError}</p>
            ) : (
              preview && (
                <div className="mt-2 flex justify-center rounded-md bg-surface-hover p-4">
                  <div
                    className="border border-dashed border-border-active"
                    style={{ zoom: 2.2 }}
                    dangerouslySetInnerHTML={{ __html: preview.html }}
                  />
                </div>
              )
            )}
            {preview?.hardToScan && (
              <p className="mt-2 text-xs text-warning">
                Esse código é comprido pra essa etiqueta — as barras ficam finas e o leitor pode
                ter dificuldade.
              </p>
            )}
          </div>

          <div className="max-w-[12rem]">
            <Label htmlFor="label-quantity">Quantas etiquetas</Label>
            <Input
              id="label-quantity"
              type="number"
              min={1}
              max={MAX_LABELS_PER_PRINT}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                handlePrint();
              }}
            />
          </div>
          {config.columns > 1 && (
            <p className="-mt-2 text-xs text-text-muted">
              Cada linha do rolo tem {config.columns} etiquetas. Pedir {config.columns},{" "}
              {config.columns * 2}, {config.columns * 3}... aproveita a linha inteira.
            </p>
          )}
        </>
      )}

      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={() => setShowSettings((value) => !value)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover"
        >
          <span>
            Tamanho do rolo: {config.labelWidth} x {config.labelHeight} mm, {config.columns}{" "}
            {config.columns === 1 ? "coluna" : "colunas"}
          </span>
          <span className="text-xs">{showSettings ? "Fechar" : "Ajustar"}</span>
        </button>
        {showSettings && (
          <div className="space-y-3 border-t border-border p-3">
            <div className="grid grid-cols-2 gap-3">
              {CONFIG_FIELDS.map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`label-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`label-${field.key}`}
                    type="number"
                    step={field.step}
                    value={draft[field.key]}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-text-muted">
              Na impressora, o papel precisa estar em{" "}
              <span className="font-semibold text-foreground">
                {page.width} x {page.height} mm
              </span>{" "}
              (uma linha inteira do rolo). Na janela de impressão: margens &quot;Nenhuma&quot; e
              escala 100%.
            </p>
            <button
              type="button"
              onClick={() => setDraft(toDraft(DEFAULT_LABEL_CONFIG))}
              className="text-xs font-medium text-text-secondary hover:underline"
            >
              Voltar ao padrão (33 x 22 mm, 3 colunas)
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" fullWidth={false} onClick={onClose}>
          Fechar
        </Button>
        <Button
          type="button"
          variant="brand"
          fullWidth={false}
          disabled={!code || !preview || !quantityValid}
          onClick={handlePrint}
        >
          Imprimir etiqueta
        </Button>
      </div>
    </div>
  );
}
