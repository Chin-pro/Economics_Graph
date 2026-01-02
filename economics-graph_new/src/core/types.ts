/* types.ts */

// General Type 基本規格
export interface BaseViewOption {
  showEquationLabels: boolean;  // 是否顯示方程式文字標籤
  labelFontSize: number;        // 字體大小

  showOpt: boolean;             // 是否顯示 Opt
  optPointColor: string,      // Opt 點顏色
  optTextColor: string,         // Opt 文字顏色
};

// Consumer Specific Type
export type ConsumerViewOptions = BaseViewOption & {
  budgetColor: string;    // Consumer Model: 預算線顏色
  indiffColor: string;    // Consumer Model: 無意曲線顏色
}

export type typePlotOffset = { x:number ; y: number };