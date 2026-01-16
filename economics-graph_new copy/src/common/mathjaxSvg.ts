// src/common/mathjaxSvg.ts

// ------------------------------------------------------------
// 目的：把 LaTeX 轉成「純 SVG 向量 path」
// - 使用 MathJax v3 的 tex2svg()
// - 透過動態插入 <script> 載入 tex-svg.js
// - 回傳 SVG markup（字串），給 SvgSceneView 插入渲染
// ------------------------------------------------------------

// >>> [MOD] 全域型別宣告：讓 TS 知道 window.MathJax 存在
declare global {
  interface Window {
    MathJax?: {
      // MathJax v3 (tex-svg bundle) 會提供 tex2svg
      tex2svg?: (tex: string, options?: { display?: boolean }) => Element;
    };
  }
}
// <<< [MOD]

// >>> [MOD] 用 module-level 變數確保「只載入一次」
let loadPromise: Promise<void> | null = null;
// <<< [MOD]

// >>> [MOD] 載入 MathJax 的 function（只會成功執行一次）
export function ensureMathJaxLoaded(): Promise<void> {
  // 逐行解釋：
  // 1) 若已經有 loadPromise，代表正在載入或已載入完成，直接回傳同一個 promise
  if (loadPromise !== null) {
    return loadPromise;
  }

  // 2) 建立新的 Promise，並記錄到 loadPromise（避免重複插入 script）
  loadPromise = new Promise<void>((resolve, reject) => {
    // 3) 若 window.MathJax.tex2svg 已存在，代表已載入，直接 resolve
    if (window.MathJax && window.MathJax.tex2svg) {
      resolve();
      return;
    }

    // 4) 建立 <script>，載入 tex-svg bundle
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";

    // 5) async：不阻塞主執行緒
    script.async = true;

    // 6) onload：成功載入後，檢查 tex2svg 是否存在，不存在就 reject
    script.onload = () => {
      if (window.MathJax && window.MathJax.tex2svg) {
        resolve();
      } else {
        reject(new Error("MathJax loaded but tex2svg() is unavailable."));
      }
    };

    // 7) onerror：網路或 CDN 問題
    script.onerror = () => {
      reject(new Error("Failed to load MathJax tex-svg bundle."));
    };

    // 8) 插入 head 開始載入
    document.head.appendChild(script);
  });

  return loadPromise;
}
// <<< [MOD]

// >>> [MOD] tex -> svg markup
export async function texToSvgMarkup(tex: string, displayMode: boolean): Promise<string> {
  // 逐行解釋：
  // 1) 確保 MathJax 已載入
  await ensureMathJaxLoaded();

  // 2) 防呆：確認 tex2svg 存在
  if (!window.MathJax || !window.MathJax.tex2svg) {
    throw new Error("MathJax.tex2svg is not available after loading.");
  }

  // 3) 呼叫 tex2svg 產生 DOM Element（裡面會含有 <svg>）
  const wrapper = window.MathJax.tex2svg(tex, { display: displayMode });

  // 4) wrapper 內會有一個 <svg>，我們把它取出
  const svg = wrapper.querySelector("svg");
  if (!svg) {
    throw new Error("MathJax.tex2svg did not produce an <svg> element.");
  }

  // 5) 讓輸出更「可嵌入」：
  //    - 移除 width/height（避免嵌入時尺寸被鎖死）
  //    - 保留 viewBox（向量縮放的關鍵）
  svg.removeAttribute("width");
  svg.removeAttribute("height");

  // 6) 將 svg 序列化成字串
  const serializer = new XMLSerializer();
  const markup = serializer.serializeToString(svg);

  return markup;
}
// <<< [MOD]
