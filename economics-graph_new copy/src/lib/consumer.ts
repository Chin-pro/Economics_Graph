/* consumer.ts */
//   - 模型計算層: 負責經濟學計算
//   - 最適消費束: x* = aI/px, y* = (1-a)I/py
//   - 預算線截距端點: (I/px,0), (0,I/py)
//   - 效用值: U = x^a y^(1-a)
//   - 無異曲線取樣: 給 U0 算出一串 (x,y) 點

// Point 型別
//   - type: TypeScript 的型別別名
//   - {x: number; y: number}: 表示「有兩個欄位 x and y，且都是 number」的物件
//   - export 讓別的檔案可以 import {Point} ... 來使用
export type Point = { x: number; y: number };

// 計算 最適合消費點
// Cobb-Douglas: U = x^a * y^(1-a)
// 需求：x* = a * I / px, y* = (1-a) * I / py
//   - export function ...: 輸出一個函式，使外部能夠呼叫
//   - "params: {...}": 函式只收到「一個參數」params，它是一個物件，裡面必須要有 a, I, px, py
export function cobbDouglasOptimum(params: {
  a: number; // 0<a<1
  I: number;
  px: number;
  py: number;
}): Point {  // 回傳值型別是 Point，也就是 {x:number, y:number}
  // 解構賦值 (destructuring): 從 params 物件裡取出同名欄位，變成 4 個局部變數
  // 等價於: "const a = param.a;
  //         const I = param.I;
  //         const px = param.px;
  //         const py = param.py;"
  const { a, I, px, py } = params;

  // Marshall Demand function
  const x = (a * I) / px;
  const y = ((1 - a) * I) / py;

  return { x: x, y: y };
}

// 預算線兩個截距端點
// 預算線：px x + py y = I
// 用兩個截距點表達線段： (I/px, 0), (0, I/py)
//   - 輸入參數 parms: I, px, py
export function budgetLineEndpoints(params: {
  I: number;
  px: number;
  py: number;
}): { p1: Point; p2: Point } {  // 回傳型別
  // 解構賦值 (destructuring)
  const { I, px, py } = params;
  return {
    p1: { x: I / px, y: 0 },  // x-intercept
    p2: { x: 0, y: I / py },  // y-intercept
  };
}

// 取樣無異曲線點陣列
// 生成一條通過最適點的無異曲線（簡化做法）
// Cobb-Douglas: U = x^a y^(1-a)
// 若給定 U0，則 y = (U0 / x^a)^(1/(1-a))
export function indifferenceCurvePoints(params: {
  exponent: number;
  U0: number;
  xEconMin: number;
  xEconMax: number;
  samplePoints: number;
}): Point[] {  // 回傳 Point[]: 一串點
  // Destructuring
  const { exponent, U0, xEconMin, xEconMax, samplePoints } = params;
  
  // 宣告陣列 pts，之後會將每個取樣點 push 進去
  const points: Point[] = [];
  const step = (xEconMax - xEconMin) / (samplePoints - 1);  // 在 [xMin, xMax] 之間取 n 個點，共 n-1 個間隔

  let i = 0;
  while (i < samplePoints) {
    const x = xEconMin + step * i;
    const y = Math.pow(U0 / Math.pow(x, exponent), 1 / (1 - exponent));
    if (Number.isFinite(y)) {  // 檢查 y 是否為有限數: 確認不是Infinity、不是-Infinity、不是NaN
      points.push({ x, y });
    }
    i += 1;
  }

  return points;
}

// 效用函數
//   - 輸入: a, x, y
//   - 回傳: 效用值
//   - 計算: U = x^{\alpha} y^{1-\alpha}
export function utilityCobbDouglas(params: {
  a: number;
  x: number;
  y: number;
}): number {
  const { a, x, y } = params;
  return Math.pow(x, a) * Math.pow(y, 1 - a);
}
