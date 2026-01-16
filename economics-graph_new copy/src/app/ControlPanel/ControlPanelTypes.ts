// src/app/ControlPanel/controlsPanelTypes.ts
// ------------------------------------------------------------
// [NEW] 方案 B：巢狀 state 型別集中
// 原因：
// - AppView / ControlsPanel / Sections 共用同一份型別，避免重複與漂移
// - 讓未來擴充 controls（供給/一般均衡/賽局）更容易新增新 group
// ------------------------------------------------------------

import type { ConsumerViewOptions } from "../../core/types";

// ------------------------------------------------------------
//  經濟模型參數（通常會觸發 heavy rebuild）
// ------------------------------------------------------------
export type ModelParams = {
    I: number;   // Income（收入）
    exponent: number;   // exponent（效用函數 x 的指數；目前 controller 叫 onAlphaChange）
    px: number;  // x 的價格
    py: number;  // y 的價格
};

// ------------------------------------------------------------
//  刻度設定（純 UI / 視覺）
// ------------------------------------------------------------
export type TickConfig = {
    ticks: number;           // 刻度數量（限制在 ALLOWED_TICKS）
    showTickLines: boolean;  // 是否顯示刻度線
    showTickLabels: boolean; // 是否顯示刻度文字
};

// ------------------------------------------------------------
//  軸標籤設定（純 UI）
// ------------------------------------------------------------
export type AxisLabelConfig = {
    xLabel: string;     // X 軸文字
    yLabel: string;     // Y 軸文字
    showXLabel: boolean; // 是否顯示 X 軸名稱
    showYLabel: boolean; // 是否顯示 Y 軸名稱
};

// ------------------------------------------------------------
//  圖表標題設定（純 UI）
// ------------------------------------------------------------
export type TitleConfig = {
    chartTitle: string;        // 圖表標題文字
    showChartTitle: boolean;   // 是否顯示圖表標題
    chartTitleFontSize: number; // 標題字級
};

// ------------------------------------------------------------
//  匯出設定（純 UI）
// ------------------------------------------------------------
export type ExportConfig = {
    exportFileName: string; // 匯出檔名
};

// ------------------------------------------------------------
//  ControlsState（巢狀分群）
//  - viewOptions：會同步到 controller（顏色/顯示開關/方程式字級等）
// ------------------------------------------------------------
export type ControlsState = {
    model: ModelParams;
    tick: TickConfig;
    axis: AxisLabelConfig;
    title: TitleConfig;
    export: ExportConfig;

    viewOptions: ConsumerViewOptions;
};

// ------------------------------------------------------------
//  ControlsPanel 的 props（維持原本的 callback 介面）
// ------------------------------------------------------------
export type ConsumerOptControlsPanelProps = {
    state: ControlsState;

    // UI state patch（注意：巢狀 state → 你上層應做 group merge）
    onChangeState: (patch: Partial<ControlsState>) => void;

    // ticks（獨立 handler：通常上層可能還要做額外行為）
    onChangeTicks: (ticks: number) => void;

    // model params（通常會造成重算）
    onIncomeChange: (I: number) => void;
    onAlphaChange: (a: number) => void;
    onPxChange: (px: number) => void;
    onPyChange: (py: number) => void;

    // view options（同步 controller）
    onViewOptionsChange: (patch: Partial<ConsumerViewOptions>) => void;

    // export
    onExportClick: () => void;
};
