// src/app/controlPanel/defaults.ts
// ------------------------------------------------------------
//  控制面板預設值（Magic numbers 統一集中）
//
//  設計理由：
//  - AppView 不應該充滿一大坨硬編碼的初始 state
//  - 預設值會隨著 UI/功能擴充而調整；集中在這裡比較好改
//  - 與 ranges/constant/types 分離，符合 SRP
// ------------------------------------------------------------

import type {
  ControlsState,
  AxisLabelConfig,
  ExportConfig,
  ModelParams,
  TickConfig,
  TitleConfig,
} from "./types";
import { ALLOWED_TICKS } from "./constants";

import type { ConsumerParams } from "../../model/ConsumerOptModel";
import type { ConsumerViewOptions } from "../../view/types";

// ------------------------------------------------------------
// ConsumerOpt（經濟模型）預設參數
// ------------------------------------------------------------
export const DEFAULT_CONSUMER_PARAMS: ConsumerParams = {
  I: 20,
  exponent: 0.5,
  px: 1,
  py: 1,
};

// ------------------------------------------------------------
// UI：ticks/labels/title/export/viewOptions 預設值
// ------------------------------------------------------------
// Tick count 的預設值希望是 5；
// 若 ALLOWED_TICKS 未包含 5，就回退到第一個允許值。
let defaultTickCount = 5;
if (!ALLOWED_TICKS.includes(defaultTickCount)) {
  defaultTickCount = ALLOWED_TICKS[0];
}

export const DEFAULT_TICK_CONFIG: TickConfig = {
  ticks: defaultTickCount,
  showTickLines: true,
  showTickLabels: true,
};

export const DEFAULT_AXIS_LABEL_CONFIG: AxisLabelConfig = {
  xLabel: "x",
  yLabel: "y",
  showXLabel: true,
  showYLabel: true,
};

export const DEFAULT_TITLE_CONFIG: TitleConfig = {
  chartTitle: "Consumer Optimum (Cobb-Douglas)",
  showChartTitle: true,
  chartTitleFontSize: 16,
};

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  exportFileName: "consumer_opt",
};

const DEFAULT_COLOR = "#111111";

export const DEFAULT_VIEW_OPTIONS: ConsumerViewOptions = {
  // equations
  showEquationLabels: true,
  labelFontSize: 12,

  // optimum
  showOpt: true,
  optPointColor: DEFAULT_COLOR,
  optTextColor: DEFAULT_COLOR,

  // lines
  budgetColor: DEFAULT_COLOR,
  indiffColor: DEFAULT_COLOR,
};

// ------------------------------------------------------------
// ControlsState 組裝工具
// ------------------------------------------------------------
export function toModelParams(params: ConsumerParams): ModelParams {
  return {
    I: params.I,
    exponent: params.exponent,
    px: params.px,
    py: params.py,
  };
}

export function createDefaultControlsState(
  params: ConsumerParams = DEFAULT_CONSUMER_PARAMS
): ControlsState {
  return {
    model: toModelParams(params),
    tick: { ...DEFAULT_TICK_CONFIG },
    axis: { ...DEFAULT_AXIS_LABEL_CONFIG },
    title: { ...DEFAULT_TITLE_CONFIG },
    export: { ...DEFAULT_EXPORT_CONFIG },
    viewOptions: { ...DEFAULT_VIEW_OPTIONS },
  };
}
