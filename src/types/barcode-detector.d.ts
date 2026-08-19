/**
 * Barcode Detection API — ainda não está no lib.dom.d.ts do TypeScript.
 * Suportada nativamente em Chrome/Edge (desktop e Android); ausente em
 * Firefox/Safari, onde `window.BarcodeDetector` simplesmente não existe
 * (ver checagem de suporte em `barcode-scanner-field.tsx`).
 */
interface BarcodeDetectorOptions {
  formats?: string[];
}

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
