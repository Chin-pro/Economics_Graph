// src/mvc/view/svg/svgViewConstants.ts
// ------------------------------------------------------------
// [NEW] SvgSceneView 所有 magic numbers 集中管理
// 目的：
// - 可在不同專案/不同 model 共用同一套 UX 參數
// - 更容易做 A/B test 或「全域體驗一致」
// ------------------------------------------------------------

import type { HitTestConfig } from "./types";

export const SVG_VIEW_STYLE = {
  // 目的：避免觸控時瀏覽器預設行為（scroll/zoom）搶走 pointer events
  // Input/Output：給 <g style={...}>
  touchAction: "none" as const,
};

export const SVG_HIT_TEST_DEFAULTS: HitTestConfig = {
  // point 命中容錯：使用者比較好點
  pointTolerancePx: 24,

  // bbox padding：給文字多一點可點範圍
  textPaddingPx: 6,

  // fallback hitbox padding（node 尚未建立或 bbox 取不到時）
  fallbackTextPaddingPx: 10,

  // 估算字寬：text.length * fontSize * factor
  approxCharWidthFactor: 0.6,

  // 預設字體大小
  defaultFontSizePx: 12,
};
