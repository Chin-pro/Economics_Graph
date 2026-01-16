// src/core/layout.ts
// ------------------------------------------------------------
// 統一管理 SVG 的尺寸與 margin，避免 AppView / GraphView / Controller
// 各自 hard-code 520-40-20 這種數字，之後改版會炸同步。
// ------------------------------------------------------------

import type { Margin } from "./types"

export const SVG_WIDTH = 520;
export const SVG_HEIGHT = 360;

export const SVG_MARGIN: Margin = {
    top: 28,
    right: 24,
    bottom: 48,
    left: 90,
};

// 可用內容區 (扣掉 margin 後) 的寬高
export function computeInnerAvailSize(): { innerWidth: number; innerHeight: number} {
    const innerWidth = SVG_WIDTH - SVG_MARGIN.left - SVG_MARGIN.right;
    const innerHeight = SVG_HEIGHT - SVG_MARGIN.top - SVG_MARGIN.bottom;
    return { innerWidth, innerHeight };
}
