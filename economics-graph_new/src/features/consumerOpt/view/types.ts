// src/features/consumerOpt/view/types.ts
// ------------------------------------------------------------
// ConsumerOpt view-layer types (feature-specific)
// 目的：
// - 把 ConsumerOpt 專屬的 ViewOptions 從 core/types.ts 移出
// - 避免 core 被單一 feature 汙染，讓未來供需/廠商/賽局可平行新增各自的 types
// ------------------------------------------------------------

// ------------------------------------------------------------
// BaseViewOption：與 ConsumerOpt 圖表「視覺」相關的通用選項
// 注意：這裡的 "Base" 是指 ConsumerOpt feature 內的共用，不代表整個 app 的共用
// ------------------------------------------------------------
export interface BaseViewOption {
  showEquationLabels: boolean; // 是否顯示方程式文字標籤
  labelFontSize: number;       // 字體大小

  showOpt: boolean;            // 是否顯示 Opt
  optPointColor: string;       // Opt 點顏色
  optTextColor: string;        // Opt 文字顏色
}

// ------------------------------------------------------------
// ConsumerViewOptions：ConsumerOpt 專屬的視覺選項
// ------------------------------------------------------------
export type ConsumerViewOptions = BaseViewOption & {
  budgetColor: string; // 預算線顏色
  indiffColor: string; // 無意曲線顏色
};
