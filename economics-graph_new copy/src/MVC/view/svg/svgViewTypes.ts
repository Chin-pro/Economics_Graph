// src/mvc/view/svg/svgViewTypes.ts
// ------------------------------------------------------------
// [NEW] SvgSceneView 子系統用的型別集中管理
// 目的：
// - 減少魔法型別散落各檔案
// - 為未來 D3/Canvas/MathBox renderer 替換做準備（介面先定義好）
// ------------------------------------------------------------

import type { Drawable } from "../../../core/drawables";

// ------------------------------------------------------------
// PixelPoint：像素座標（SvgSceneView 只處理 pixel domain）
// Input/Output：x,y 皆為 pixel 純量
// ------------------------------------------------------------
export type PixelPoint = { x: number; y: number };

// ------------------------------------------------------------
// DragKind：可拖曳的 drawable 類型（目前：point/text）
// 未來可擴充：例如 "handle", "controlPoint", "anchor" 等
// ------------------------------------------------------------
export type DragKind = "point" | "text";

// ------------------------------------------------------------
// DragState：View 內部的拖曳狀態（不進 React state，避免 move 觸發 re-render）
// ------------------------------------------------------------
export type DragState = {
  draggingId: string | null;     // 目前拖曳的 drawable.id
  draggingKind: DragKind | null; // 目前拖曳的種類
  pointerId: number | null;      // Pointer Events 的 pointerId（避免多指干擾）
};

// ------------------------------------------------------------
// DragCallbacks：往上層回報拖曳（View 不做狀態回推）
// Input：id + pixel 座標
// Output：void（交由上層 Controller 決策 Heavy/Light）
// ------------------------------------------------------------
export type DragCallbacks = {
  onPointDrag?: (id: string, pixel: PixelPoint) => void;
  onTextDrag?: (id: string, pixel: PixelPoint) => void;
};

// ------------------------------------------------------------
// HitTestResult：命中結果（若命中 draggable 物件）
// ------------------------------------------------------------
export type HitTestResult = {
  id: string;
  kind: DragKind;
};

// ------------------------------------------------------------
// HitTestConfig：hit-test 的可調參數（集中管理 magic numbers）
// ------------------------------------------------------------
export type HitTestConfig = {
  pointTolerancePx: number;       // point 命中容錯（會加在 point 半徑上）
  textPaddingPx: number;          // text bbox padding
  fallbackTextPaddingPx: number;  // text fallback hitbox padding
  approxCharWidthFactor: number;  // 估算字寬：fontSize * factor
  defaultFontSizePx: number;      // text 沒給 fontSize 時的預設
};

// ------------------------------------------------------------
// Renderer：把 Drawable 轉成可渲染的節點
// 設計目的：
// - 讓 SvgSceneView 不綁死「SVG 的畫法」
// - 未來可替換成 D3 renderer、Canvas renderer、WebGL/MathBox renderer
// ------------------------------------------------------------
export type DrawableRenderer = {
  // Input：drawable（pixel domain）
  // Output：ReactNode（或 null 表示此 drawable 不渲染）
  renderDrawable: (d: Drawable) => React.ReactNode;
};
