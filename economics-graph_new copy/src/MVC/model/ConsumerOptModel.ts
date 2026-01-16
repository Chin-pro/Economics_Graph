// src/mvc/model/ConsumerOptModel.ts

// ------------------------------------------------------------
// Model 層的任務：
// 1) 保存「狀態」：I, px, py, a
// 2) 提供「商業/領域計算」：預算線、最適點、效用、無異曲線
//
// Model 不應該知道 View，也不應該知道 SVG/React；
// 它只做「經濟學世界」的事情（純計算 + 狀態）。
// ------------------------------------------------------------

// 從 lib/consumer 匯入純計算函式（不依賴 React）
// 這些函式就是你原本 consumer.ts 的功能，只是放在 lib 層。
// Model 只是包一層：把內部 params 拿出來丟進去算。
import {
  budgetLineEndpoints,     // 給 I, px, py 算預算線兩端點（經濟座標）
  cobbDouglasOptimum,      // 給 a, I, px, py 算 Cobb-Douglas 最適點（經濟座標）
  indifferenceCurvePoints, // 給 a, U0, xMin, xMax, n 算無異曲線取樣點（經濟座標）
  utilityCobbDouglas,      // 給 a, x, y 算效用 U
} from "../../lib/consumer";

// ------------------------------------------------------------
// ConsumerParams：Model 的核心狀態型別
// - I : income（所得）
// - px, py : 兩種商品價格
// - a : Cobb-Douglas 中 x 的權重（0<a<1）
// ------------------------------------------------------------
export type ConsumerParams = {
  I: number;
  px: number;
  py: number;
  exponent: number;
};

// ------------------------------------------------------------
// ConsumerOptModel：
// - 內部持有 params
// - 提供 getter/setter
// - 提供 computeXxx()：把 params 餵給 lib/consumer 的純函式
// ------------------------------------------------------------
export class ConsumerOptModel {
  // private：外部不能直接改 this.params
  // 這是 OOP 的封裝：想改參數必須走 setIncome / setAlpha / setPrices
  private ModelParams: ConsumerParams;

  // 建構子：接收初始參數
  constructor(initial: ConsumerParams) {
    // this.params = initial 也可以，但會直接保留 reference
    // 你用 {...initial} 代表「複製一份」，避免外部還握著同一個物件 reference
    // （保護封裝，避免外部偷偷改 initial 影響 model）
    this.ModelParams = { ...initial };
  }

  // ----------------------------------------------------------
  // getModelParams：對外提供一份參數快照（snapshot）
  // ----------------------------------------------------------
  getModelParams(): Readonly<ConsumerParams> {
    // 同樣用 {...this.params} 回傳複製品
    // 避免外部拿到 reference 之後直接改內容（破壞封裝）
    return { ...this.ModelParams };
  }

  // ----------------------------------------------------------
  // setters：提供 Controller 更新參數的入口
  // Controller 不應該直接碰 this.params，所以走這些方法
  // ----------------------------------------------------------

  // 設定收入
  setIncome(I: number): void {
    this.ModelParams.I = I;
  }

  // 設定 alpha（x 的權重）
  setAlpha(alpha: number) {
    this.ModelParams.exponent = alpha;
  }

  // 設定兩個價格
  setPrices(px: number, py: number) {
    this.ModelParams.px = px;
    this.ModelParams.py = py;
  }

  // ----------------------------------------------------------
  // computeXxx：領域計算（經濟學計算）
  // Model 提供「以自身 params 為基礎」的計算捷徑
  // ----------------------------------------------------------

  // computeBudget：計算預算線兩端點
  computeBudget() {
    const p = this.ModelParams; // 取 params 的 reference（方便寫）
    // 丟進 lib 的純函式計算
    // 回傳通常是 {p1:{x,y}, p2:{x,y}}（經濟座標）
    return budgetLineEndpoints({ I: p.I, px: p.px, py: p.py });
  }

  // computeOptimum：計算 Cobb-Douglas 最適點
  computeOptimum() {
    const p = this.ModelParams;
    // 回傳通常是 {x, y}（經濟座標）
    return cobbDouglasOptimum({ a: p.exponent, I: p.I, px: p.px, py: p.py });
  }

  // computeUtilityAt：給定任意 (x,y) 計算效用
  // 注意：這裡的 x,y 是「經濟座標」，不是像素座標 (xEcon, yEcon)
  computeUtilityAt(xEcon: number, yEcon: number): number {
    const p = this.ModelParams;
    // 回傳一個 number：U
    return utilityCobbDouglas({ a: p.exponent, x: xEcon, y: yEcon });
  }

  // computeIndifferenceCurve：給定 U0，回傳無異曲線的取樣點
  // - U0：要達到的效用水準
  // - xMin/xMax：取樣 x 範圍（避免 x=0 造成數值爆炸）
  // - n：取樣點數
  //
  // 回傳：Point[]（經濟座標點列）
  computeIndifferenceCurve(U0: number, xEconMin: number, xEconMax: number, samplePoints: number) {
    const params = this.ModelParams;
    return indifferenceCurvePoints({ 
      exponent: params.exponent, 
      U0: U0, 
      xEconMin: xEconMin, 
      xEconMax: xEconMax, 
      samplePoints: samplePoints 
    });
  }
}
