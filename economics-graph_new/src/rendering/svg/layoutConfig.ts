// src/rendering/svg/layoutConfig.ts
// ------------------------------------------------------------
//  SVG Renderer 的畫布配置（尺寸 / margin）
//
//  設計理由：
//  - 這些數值是「renderer-specific」：未來換成 D3/Canvas/MathBox
//    可能就會有不同的 width/height/margin。
//  - 因此不要放在 core；讓 core 只保留「通用型別 + 純計算工具」。
// ------------------------------------------------------------

import { computeInnerSize, type Margin } from "../../core/layout";

export type SvgCanvasConfig = {
  width: number;
  height: number;
  margin: Margin;
};

// ------------------------------------------------------------
// SVG_CANVAS_CONFIG
// - 全專案單一來源（Single Source of Truth）
// - 如果日後你用 Figma Make 改尺寸，只要改這裡
// ------------------------------------------------------------
export const SVG_CANVAS_CONFIG: SvgCanvasConfig = {
  width: 520,
  height: 360,
  margin: {
    top: 28,
    right: 24,
    bottom: 48,
    left: 90,
  },
} as const;

export const SVG_CANVAS_WIDTH = SVG_CANVAS_CONFIG.width;
export const SVG_CANVAS_HEIGHT = SVG_CANVAS_CONFIG.height;
export const SVG_CANVAS_MARGIN = SVG_CANVAS_CONFIG.margin;

// ------------------------------------------------------------
// computeSvgInnerAvailSize
// - 給 controller 初始化 viewport 時使用
// - 也給 GraphView 做 layout 計算時使用
// ------------------------------------------------------------
export function computeSvgInnerAvailSize(): { innerWidth: number; innerHeight: number } {
  return computeInnerSize(SVG_CANVAS_WIDTH, SVG_CANVAS_HEIGHT, SVG_CANVAS_MARGIN);
}
