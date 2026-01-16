// src/core/layout/compute.ts
// ------------------------------------------------------------
//  Layout 計算工具（純函數）
//
//  SRP：
//  - 不綁任何 renderer（SVG/Canvas/WebGL）
//  - 不持有任何預設常數（避免把特定 UI 魔術數值塞進 core）
// ------------------------------------------------------------

import type { Margin } from "./types";

export type InnerSize = {
  innerWidth: number;
  innerHeight: number;
};

// ------------------------------------------------------------
// computeInnerSize
//
// 設計目的：
// - 給定外框 width/height 與 margin，回傳 inner 可用寬高
//
// Input：
// - width: number（外框寬）
// - height: number（外框高）
// - margin: Margin（留白）
//
// Output：InnerSize
// - innerWidth = width - margin.left - margin.right
// - innerHeight = height - margin.top - margin.bottom
// - 會 clamp 到 >= 0，避免負值
// ------------------------------------------------------------
export function computeInnerSize(width: number, height: number, margin: Margin): InnerSize {
  let innerWidth = width - margin.left - margin.right;
  let innerHeight = height - margin.top - margin.bottom;

  if (innerWidth < 0) {
    innerWidth = 0;
  }
  if (innerHeight < 0) {
    innerHeight = 0;
  }

  return { innerWidth, innerHeight };
}
