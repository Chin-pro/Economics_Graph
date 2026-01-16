// src/rendering/svg/rafCoalescer.ts
// ------------------------------------------------------------
// Backward-compatible re-export for SvgSceneView
// 目的：
// - SvgSceneView 需要一個 rAF coalescer
// - 實作統一放在 rendering/raf/RafCoalescer.ts（泛型版本）
// ------------------------------------------------------------

export { RafCoalescer } from "../raf/RafCoalescer";
