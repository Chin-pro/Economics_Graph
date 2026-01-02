// src/MVC/controller/consumerOptEquation.ts

// ------------------------------------------------------------
//  方程式字串 / spans 生成（類 LaTeX 的 tspan）
//    - 把文字排版邏輯從 controller/sceneBuilder 拔掉，
//      controller/SceneBuilder 不會充滿文字拼接邏輯 (可讀性與可維護性提升)
//    - 只負責「把經濟方程式變成可畫在 SVG 上的文字片段 (spans)」
//      而不是去計算經濟模型、也不去畫線、也不是去處理拖曳 
//    - textSpan:假上下標
// ------------------------------------------------------------

import type { TextSpan } from "../../core/drawables";

export function formatNum(value: number):string {
    return value.toFixed(2);
}

function computeSupSize(base: number): number {
    const supTextSize = Math.round(base * 0.8);
    if (supTextSize < 8) {
        return 8;
    }
    return supTextSize;
}

export function buildUtilitySpans(exponent: number, fontSize: number): TextSpan[] {
    const supTextSize = computeSupSize(fontSize);

    return [
        { text: "U(x,y) = x" },        // 效用函數主體
        { text: "α", baselineShift: "super", fontSize: supTextSize },  
        // - baselineShift: "super" 代表「基線上移」-> 上標效果
        // - fontSize: supTextSize 代表「上標字比較少」
        { text: "y" },                 // 效用函數主體
        { text: "1-α", baselineShift: "super", fontSize: supTextSize },
        { text: ",  α=" + formatNum(exponent) },
    ];
}

export function buildBudgetSpans(px: number, py: number, I: number, fontSize: number): TextSpan[] {
    const supTextSize = computeSupSize(fontSize);
    // 回傳 spans 讓 renderer 畫出：pₓ x + pᵧ y = I（其中 x,y 為下標）
    return [
        { text: "p" },
        { text: "x", baselineShift: "sub", fontSize: supTextSize },
        { text: " x + p" },
        { text: "y", baselineShift: "sub", fontSize: supTextSize },
        { text: " y = I" },
        { text: ",  p" },
        { text: "x", baselineShift: "sub", fontSize: supTextSize },  //pₓ 的下標 x
        { text: "=" + formatNum(px) },
        { text: ",  p" },
        { text: "y", baselineShift: "sub", fontSize: supTextSize },  // pᵧ 的下標 y
        { text: "=" + formatNum(py) },                               // =py 的數值字串
        { text: ",  I=" + formatNum(I) },
    ];
}

export function buildIndiffSpans(U0: number, a: number, fontSize: number): TextSpan[] {
    // y = (U₀ / x^α)^(1/(1-α)),  U₀=..., α=...
    const supTextSize = computeSupSize(fontSize);

    return [
        { text: "y = (U" },
        { text: "0", baselineShift: "sub", fontSize: supTextSize },
        { text: " / x" },
        { text: "α", baselineShift: "super", fontSize: supTextSize },
        { text: ")" },
        { text: "1/(1-α)", baselineShift: "super", fontSize: supTextSize },
        { text: ",  U" },
        { text: "0", baselineShift: "sub", fontSize: supTextSize },
        { text: "=" + formatNum(U0) + ",  α=" + formatNum(a) },
    ];
}