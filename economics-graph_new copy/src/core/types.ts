/* src/core/types.ts */

// ------------------------------------------------------------
// ✅ [CHANGED] 新增 Margin：給 layout / AxesView / GraphView 共用
// 修改原因：
// - Margin 是純 UI layout 型別，會被多個 View/Renderer 共用
// - 讓 import type { Margin } from "../../core/types" 合法
// - 避免各檔案各自定義 Margin 造成漂移
// ------------------------------------------------------------

// ------------------------------------------------------------
// Margin：SVG/畫布留白設定
// ------------------------------------------------------------
export type Margin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

// ------------------------------------------------------------
// PlotOffset：plot 區在 inner 可用空間內的置中位移
// ------------------------------------------------------------
export type PlotOffset = {
  x: number;
  y: number;
};

// ------------------------------------------------------------
// General Type 基本規格
// ------------------------------------------------------------
export interface BaseViewOption {
  showEquationLabels: boolean; // 是否顯示方程式文字標籤
  labelFontSize: number;       // 字體大小

  showOpt: boolean;            // 是否顯示 Opt
  optPointColor: string;       // Opt 點顏色
  optTextColor: string;        // Opt 文字顏色
}

// ------------------------------------------------------------
// Consumer Specific Type
// ------------------------------------------------------------
export type ConsumerViewOptions = BaseViewOption & {
  budgetColor: string; // Consumer Model: 預算線顏色
  indiffColor: string; // Consumer Model: 無意曲線顏色
};
