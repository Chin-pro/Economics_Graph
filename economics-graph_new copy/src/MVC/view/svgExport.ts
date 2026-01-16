// src/mvc/view/svgExport.ts

// ------------------------------------------------------------
// SVG Export utility（SRP：匯出與 View 元件分離）
// - GraphView 只負責「觸發匯出」
// - 真正的 DOM clone / serialize / download 在這裡做
// ------------------------------------------------------------

type ExportSvgOptions = {
  fileNameRaw: string;
  width: number;
  height: number;
  exportStyle?: string; // 例如 "color: black;"
};

/**
 * exportSvgElement
 * Input:
 * - svg: SVGSVGElement（畫面上的 svg DOM）
 * - options: ExportSvgOptions
 * Output:
 * - void
 *
 * 設計目的：
 * - clone 一份 svg，避免汙染畫面上的 DOM（避免 cache 污染）
 * - 加上 xmlns / viewBox，讓 LaTeX / Inkscape 等工具更穩定
 * - 下載檔案並清理 URL
 */
export function exportSvgElement(svg: SVGSVGElement, options: ExportSvgOptions): void {
  let fileName = options.fileNameRaw.trim();
  if (fileName.length === 0) {
    fileName = "figure.svg";
  }

  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".svg")) {
    fileName = fileName + ".svg";
  }

  const svgCloned = svg.cloneNode(true) as SVGSVGElement;

  svgCloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svgCloned.setAttribute("viewBox", `0 0 ${options.width} ${options.height}`);

  if (options.exportStyle) {
    svgCloned.setAttribute("style", options.exportStyle);
  }

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgCloned);
  const withHeader = `<?xml version="1.0" encoding="UTF-8"?>\n${source}`;

  const blob = new Blob([withHeader], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
