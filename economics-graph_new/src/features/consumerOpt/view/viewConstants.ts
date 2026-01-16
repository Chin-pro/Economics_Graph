// src/mvc/view/viewConstants.ts

// ------------------------------------------------------------
// View constants（集中管理 magic numbers）
// - SRP：把「視圖常數」從元件邏輯拆出去
// - 未來你做 Theme / 多圖表一致風格（AE LMS）會很需要
// ------------------------------------------------------------

import type { CSSProperties } from "react";

export const SVG_BORDER_STYLE: CSSProperties = {
    border: "1px solid #ddd",
};

// 圖表標題位置：期刊風格常用圖內上方置中
export const CHART_TITLE_Y = 14;

// 匯出 SVG 時的預設顏色（因為你很多 stroke 用 currentColor）
export const EXPORT_SVG_STYLE = "color: black;";
