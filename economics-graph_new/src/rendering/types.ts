// src/rendering/types.ts
// ------------------------------------------------------------
// Renderer interface (Step 1: "介面釘死")
// ------------------------------------------------------------
// 目的：
// - 讓 app / features 不直接依賴某一種 renderer 實作（SVG / D3 / MathBox / Canvas ...）
// - 先把 render / hitTest / export / dispose 的介面固定下來
//
// 設計原則：
// - 以「長期擴充」為目標：render() 不綁死特定技術，但目前先回傳 ReactElement
// - export() 目前沿用現有 SVG export 的「直接下載」行為；未來可改成回傳 Blob
// ------------------------------------------------------------

import React from "react";

import type { SceneOutput } from "../core/drawables";

// ------------------------------------------------------------
// PixelPoint：所有 renderer 都能理解的 pixel 座標
// ------------------------------------------------------------
export type PixelPoint = {
  x: number;
  y: number;
};

// ------------------------------------------------------------
// DragKind / HitTestResult：抽象化 draggable 的種類
// ------------------------------------------------------------
export type DragKind = "text" | "point";

export type HitTestResult = {
  id: string;
  kind: DragKind;
};

// ------------------------------------------------------------
// RenderCallbacks：renderer 把互動事件回傳給外部（通常是 Controller）
// ------------------------------------------------------------
export type RenderCallbacks = {
  onPointDrag?: (id: string, pixel: PixelPoint) => void;
  onTextDrag?: (id: string, pixel: PixelPoint) => void;
};

// ------------------------------------------------------------
// render() 的輸入
// ------------------------------------------------------------
export type RendererRenderArgs = {
  scene: SceneOutput;
  callbacks: RenderCallbacks;
};

// ------------------------------------------------------------
// hitTest() 的輸入
// - local：相對於 renderer 內部 plot-area 的座標（pixel）
// ------------------------------------------------------------
export type RendererHitTestArgs = {
  scene: SceneOutput;
  local: PixelPoint;
};

// ------------------------------------------------------------
// export() 的輸入
// - container：由 renderer 自己決定 export 的來源（SVG element / canvas / WebGL capture ...）
// - 先用 unknown，避免把 renderer 鎖死在 SVG。
// ------------------------------------------------------------
export type RendererExportArgs = {
  container: unknown;
  fileNameRaw: string;
  width: number;
  height: number;
  format?: string; // "svg" | "png" | ...
};

// ------------------------------------------------------------
// Renderer：固定介面（Step 1 驗收要求）
// ------------------------------------------------------------
export interface Renderer {
  // 用於辨識 renderer（例如 "svg" / "d3" / "mathbox"）
  readonly id: string;

  // 主要渲染入口
  render(args: RendererRenderArgs): React.ReactElement;

  // 命中判定（例如拖曳 label / 拖曳點）
  hitTest(args: RendererHitTestArgs): HitTestResult | null;

  // 匯出圖表
  export(args: RendererExportArgs): void;

  // 資源釋放（WebGL context / DOM registry / event listener ...）
  dispose(): void;
}
