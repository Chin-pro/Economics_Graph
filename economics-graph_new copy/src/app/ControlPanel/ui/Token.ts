// src/app/ControlPanel/ui/Tokens.ts
// ------------------------------------------------------------
//  UI Tokens（設計 Token / 視覺常數）
//  - 去除 magic number（width/gap/padding/fontSize/borderRadius...）
//  - 讓視覺調整只改這個檔案，不需要到處翻 JSX
//  - SRP：這個檔案只管 UI 視覺常數，不管業務/型別/行為
// ------------------------------------------------------------

import type React from "react";

// ------------------------------------------------------------
//  UI_TOKENS：集中管理所有視覺相關數值
//  - panel：控制面板容器
//  - sectionCard：卡片區塊外框
//  - typography：文字（label）
//  - spacing：通用間距
// ------------------------------------------------------------
export const UI_TOKENS = {
    panel: {
        width: 340, // 原本 JSX 寫死 width: 340 → 這裡統一管理
        gap: 14,    // 原本 JSX 寫死 gap: 14 → 統一管理
    },

    sectionCard: {
        padding: 10,            // 卡片 padding 統一管理
        borderWidth: 1,         // 邊框寬度
        borderColor: "#eee",  // 邊框顏色
        borderRadius: 8,        // 圓角
        titleFontWeight: 600,   // 區塊標題字重
        titleMarginBottom: 8,   // 區塊標題下方間距
    },

    typography: {
        labelFontSize: 12,     // 原本很多地方 fontSize: 12 → 統一管理
        labelOpacity: 0.8,     // 原本很多地方 opacity: 0.8 → 統一管理
        labelMarginBottom: 6,  // 原本很多地方 marginBottom: 6 → 統一管理
    },

    spacing: {
        xs: 6,   // 常用小間距（checkbox row）
        sm: 8,   // 常用中間距
        md: 10,  // 常用較大間距（左右欄位 gap）
        lg: 12,  // 顏色欄位 gap
    },
} as const;

// ------------------------------------------------------------
// 常用 style 物件（避免每個檔案都重建 style）
// ------------------------------------------------------------

// Panel 容器 style
export const PANEL_STYLE: React.CSSProperties = {
    width: UI_TOKENS.panel.width,
    display: "flex",
    flexDirection: "column",
    gap: UI_TOKENS.panel.gap,
};

// 通用 label（小字 + 透明度）的 style
export const LABEL_STYLE: React.CSSProperties = {
    fontSize: UI_TOKENS.typography.labelFontSize,
    opacity: UI_TOKENS.typography.labelOpacity,
    marginBottom: UI_TOKENS.typography.labelMarginBottom,
};
