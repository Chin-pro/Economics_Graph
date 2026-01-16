// src/MVC/controller/consumerOptEquation.ts

// ------------------------------------------------------------
//  方程式字串 / spans 生成（類 LaTeX 的 tspan）
//
//  ✅ 本檔案只做：把「方程式」轉成「TextSpanInput[]（可選欄位）」
//  ✅ Strict TextSpan 的預設值補齊，交給 drawables.ts 的 resolver
//
//  [CHANGED] 改用 TextSpanInput（不是 TextSpan）
//  - 原因：TextSpan 現在是 Strict 必填；這裡不應該重複填一堆預設值
// ------------------------------------------------------------

import type { TextSpanInput } from "../../core/drawables"; // [CHANGED] TextSpan -> TextSpanInput

// ------------------------------------------------------------
//  集中管理：避免 magic number 散落
// ------------------------------------------------------------
const NUM_DECIMALS: number = 2;        // [CHANGED] 數字顯示小數位數集中管理
const SUP_SCALE: number = 0.8;         // [CHANGED] 上/下標字級比例
const MIN_SUP_FONT_SIZE: number = 8;   // [CHANGED] 上/下標最小字級，避免太小看不見

// ------------------------------------------------------------
//  formatNum
//  - 統一數字格式
//  - 額外處理：Infinity / NaN / -0
// ------------------------------------------------------------
export function formatNum(value: number): string {
    // [CHANGED] 先處理非有限數字，避免畫面出現 "Infinity" 或 "NaN" 造成閱讀問題
    if (!Number.isFinite(value)) {
        if (value === Infinity) {
            return "∞";
        }
        if (value === -Infinity) {
            return "-∞";
        }
        return "NaN";
    }

    // [CHANGED] 修正 -0 顯示成 "-0.00" 的狀況
    let v = value;
    if (Object.is(v, -0)) {
        v = 0;
    }

    // 固定小數位數
    return v.toFixed(NUM_DECIMALS);
}

// ------------------------------------------------------------
//  computeSupSize
//  Input: base fontSize
//  Output: 上/下標字級（至少 MIN_SUP_FONT_SIZE）
// ------------------------------------------------------------
function computeSupSize(base: number): number {
    // 上/下標字級 = base * SUP_SCALE
    const supTextSize = Math.round(base * SUP_SCALE);

    // 下限保護
    if (supTextSize < MIN_SUP_FONT_SIZE) {
        return MIN_SUP_FONT_SIZE;
    }
    return supTextSize;
}

// ------------------------------------------------------------
//  span helpers
//  - 讓 buildXXXSpans 的內容更乾淨
//  - 回傳 TextSpanInput：只填必要的 text +（可選）baselineShift/fontSize/kind
// ------------------------------------------------------------
function normal(text: string): TextSpanInput {
    return {
        text: text,
        kind: "normal", // [CHANGED] 明確標註語意（即使 resolver 有 default）
    };
}

function sup(text: string, supFontSize: number): TextSpanInput {
    return {
        text: text,
        baselineShift: "super",
        fontSize: supFontSize,
        kind: "sup", // [CHANGED] 明確語意
    };
}

function sub(text: string, supFontSize: number): TextSpanInput {
    return {
        text: text,
        baselineShift: "sub",
        fontSize: supFontSize,
        kind: "sub", // [CHANGED] 明確語意
    };
}

// ------------------------------------------------------------
//  buildUtilitySpans
//  Input:
//   - exponent: α（效用函數參數）
//   - fontSize: 文字主體字級
//  Output:
//   - TextSpanInput[]：U(x,y) = x^α y^(1-α), α=...
// ------------------------------------------------------------
export function buildUtilitySpans(exponent: number, fontSize: number): TextSpanInput[] {
    const supTextSize = computeSupSize(fontSize);

    return [
        normal("U(x,y) = x"),
        sup("α", supTextSize),
        normal("y"),
        sup("1-α", supTextSize),
        normal(",  α=" + formatNum(exponent)),
    ];
}

// ------------------------------------------------------------
//  buildBudgetSpans
//  Input:
//   - px, py: 價格
//   - I: 所得
//   - fontSize: 文字主體字級
//  Output:
//   - TextSpanInput[]：pₓ x + pᵧ y = I, px=..., py=..., I=...
// ------------------------------------------------------------
export function buildBudgetSpans(px: number, py: number, I: number, fontSize: number): TextSpanInput[] {
    const supTextSize = computeSupSize(fontSize);

    return [
        normal("p"),
        sub("x", supTextSize),
        normal(" x + p"),
        sub("y", supTextSize),
        normal(" y = I"),
        normal(",  p"),
        sub("x", supTextSize),
        normal("=" + formatNum(px)),
        normal(",  p"),
        sub("y", supTextSize),
        normal("=" + formatNum(py)),
        normal(",  I=" + formatNum(I)),
    ];
}

// ------------------------------------------------------------
//  buildIndiffSpans
//  Input:
//   - U0: 無異曲線效用水準
//   - a: α
//   - fontSize: 文字主體字級
//  Output:
//   - TextSpanInput[]：y = (U₀ / x^α)^(1/(1-α)), U₀=..., α=...
//
//  註：你這裡用 spans 模擬 LaTeX 上/下標：
//    - U₀：0 用 sub
//    - x^α：α 用 super
//    - ^(1/(1-α))：整段用 super
// ------------------------------------------------------------
export function buildIndiffSpans(U0: number, a: number, fontSize: number): TextSpanInput[] {
    const supTextSize = computeSupSize(fontSize);

    return [
        normal("y = (U"),
        sub("0", supTextSize),
        normal(" / x"),
        sup("α", supTextSize),
        normal(")"),
        sup("1/(1-α)", supTextSize),
        normal(",  U"),
        sub("0", supTextSize),
        normal("=" + formatNum(U0) + ",  α=" + formatNum(a)),
    ];
}
