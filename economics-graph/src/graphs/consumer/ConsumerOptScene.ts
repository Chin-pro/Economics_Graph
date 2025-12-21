/* ConsumerOptScene.ts */
// 輸入: 一組經濟參數 I, px, py, a
// 中間: 算出預算線、最適點、對應無意曲線(經濟世界座標)
// 輸出: 一組、"可繪圖指令" drawables (如:line / polyline / point / point)，並且把座標轉成像素座標

// 匯入型別與工具
// 匯入抽象類別: 
//   - Drawable: union type，代表 "一個可被畫出來的物件"
//   - SceneOutput: 場景輸出格式，通常包含 {width, height, drawables}
import type { Drawable, SceneOutput } from "../core/drawables";
// 匯入工具類別: 負責 "經濟座標 -> 像素座標" 轉換
import { Viewport } from "../core/Viewport";

// 匯入經濟學計算函式
import {
  budgetLineEndpoints,      // 回傳預算線兩端點(在經濟座標)
  cobbDouglasOptimum,       // 算 Cobb-Douglas 最適消費束
  indifferenceCurvePoints,  // 計算效用
  utilityCobbDouglas,       // 取樣出無意曲線的一堆點
} from "../../lib/consumer";

export class ConsumerOptScene {    // export class: 這個 scene 可以被外部匯入使用
  // private: 只能在 class 內部存取 -> 外部無法使用 scene.innerW 與 scene.innerH
  // readonly: 唯讀，建構後不刻在更改
  // ": number": 欄位型別是 number
  private readonly innerW: number;
  private readonly innerH: number;
  
  // 建構子
  constructor(innerW: number, innerH:number) {
    this.innerW = innerW;
    this.innerH = innerH;
  }
  
  // build 方法: 核心輸入輸出
  //   - build(...): 產生場景輸出
  //   - "params: {...}": 用 inline object type 描述參數型別
  //       - I, px, py, a: 全部都是 number
  //   - ": SceneOutput": 回傳的型別是 SceneOutput (能夠被 renderer 畫出)
  build(params: { I: number; px: number; py: number; a: number }): SceneOutput {
    // const: immutable reference 不可重新指定
    const I = params.I;
    const px = params.px;
    const py = params.py;
    const a = params.a;

    // 決定經濟座標的顯示範圍
    //   - "*1.2": 保留 20% 邊界，不讓線貼邊
    const xMax = (I / px) * 1.2;
    const yMax = (I / py) * 1.2;

    // 建立 Viewport
    // [0, xMax]: 經濟座標 x 範圍
    // [0, yMax]: 經濟座標 y 範圍
    const vp = new Viewport(this.innerW, this.innerH, [0, xMax], [0, yMax]);
    
    // 算預算線、最適點、以及該點的效用
    //   - budgetLineEndpoints(...): 回傳兩點，例如 p1, p2
    //   - cobbDouglasOptimum(...): 回傳 {x,y} (最適消費)
    //   - utilityCobbDouglas(...): 用最適點算出 U0
    const budget = budgetLineEndpoints({ I, px, py });
    const opt = cobbDouglasOptimum({ a, I, px, py });
    const U0 = utilityCobbDouglas({ a, x: opt.x, y: opt.y });

    // 決定無異曲線取樣的 x 範圍
    //   - "0.0001": 避免 x=0 (Cobb-Douglas通常會有 x^a，x=0 可能造成數值問題或 Infinity)
    //   - xMax * 0.05: 避免從太小的 x 開始，曲線會非常陡、數值不穩定
    const xMin = Math.max(0.0001, xMax * 0.05);

    // 取樣無異曲線 (經濟座標點)
    const curveEconPts = indifferenceCurvePoints({
      a,
      U0,
      xMin,
      xMax,
      n: 60,  // 取 60 個點，畫 polyline
    });

    // 經濟座標 -> 像素座標
    //   - .map(...): 把陣列每個點轉換成另一個點
    //     - curveEconPts.map((p) => vp.map(p)) 等價於 
    //         "const curvePxPts = [];
    //          for (const p of curveEconPts) {
    //            curvePxPts.push(vp.map(p));
    //          }
    //         "
    //   - (p) => vp.map(p): 等價於
    //         "function (p){
    //            return vp.map(p);
    //          }"
    //   - opt 是單點，不是陣列，所以直接 vp.map(opt)
    const curvePxPts = curveEconPts.map((p) => vp.map(p));
    const optPx = vp.map(opt);

    // 組裝 drawables
    //   - Drawable[]: 陣列裡每個元素都必須符合 Drawable 型別
    const drawables: Drawable[] = [
      // 預算線 drawable
      {
        kind: "line",            // 告訴 renderer 這是一條線
        id: "budget",            // 方便 renderer 或 互動系統便是(如: hover、更新、debug)
        a: vp.map(budget.p1),    // a, b: 線段兩端點(像素座標)
        b: vp.map(budget.p2),
        stroke: { width: 2, color: "currentColor" },  // 用 CSS 的目前文字顏色
      },
      // 無異曲線 polyline
      {
        kind: "polyline",      // 多線段
        id: "indiff",
        points: curvePxPts,    // 取樣點
        stroke: { width: 2, color: "currentColor" },
      },
      // 最適點 point
      {
        kind: "point",  // 畫一個點
        id: "opt",
        center: optPx,  // 像素座標
        r: 4,    // 半徑
        fill: { color: "currentColor" },  // 填滿顏色
      },
      // 最適點標籤 text
      {
        kind: "text",  // 文字
        id: "opt-label",
        pos: { x: optPx.x + 8, y: optPx.y - 8 },  // 文字位置 pos
        text: "Opt",  // 顯示內容
        fontSize: 12,
      },
    ];

    // 回傳 SceneOutput
    //   - 回傳寬高 與 drawable列表
    //   - renderer 只要吃到這個結果就能畫完整張圖
    return {
    width: this.innerW,
    height: this.innerH,
    drawables,
    xDomain: [0, xMax],
    yDomain: [0, yMax],
    };
  }

}
