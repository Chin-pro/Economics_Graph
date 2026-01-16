// src/app/ControlPanel/SliderRanges.ts
// ------------------------------------------------------------
// [NEW] Ranges（滑桿/輸入範圍）
// 修改原因：
// - 去除 magic number（min/max/step）散落在 JSX
// - 讓「控制面板的數值範圍」集中管理
// - SRP：這個檔案只管 ranges，不管 UI、不管型別、不管行為
// ------------------------------------------------------------

export const SLIDER_RANGES = {
    equationFont: { min: 8, max: 24, step: 1 },
    titleFont: { min: 10, max: 26, step: 1 },

    income: { min: 5, max: 60, step: 1 },

    // exponent（exponent/alpha）
    exponent: { min: 0.1, max: 0.9, step: 0.01 },

    // px / py
    price: { min: 0.1, max: 5, step: 0.1 },
} as const;
