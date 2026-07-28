// pdfmake ships no TypeScript declarations. This is the minimal surface
// jd-pdf.ts actually uses from the default-exported singleton instance.
declare module "pdfmake" {
  type FontDescriptor = {
    normal: string;
    bold?: string;
    italics?: string;
    bolditalics?: string;
  };

  type PdfDocument = {
    getBuffer(): Promise<Buffer>;
  };

  type TableLayout = Record<string, (...args: unknown[]) => unknown>;

  class PdfMake {
    setFonts(fonts: Record<string, FontDescriptor>): void;
    setTableLayouts(layouts: Record<string, TableLayout>): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    createPdf(docDefinition: Record<string, unknown>): PdfDocument;
  }

  const instance: PdfMake;
  export default instance;
}
