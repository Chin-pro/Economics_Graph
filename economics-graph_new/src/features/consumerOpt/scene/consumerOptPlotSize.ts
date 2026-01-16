// src/MVC/controller/consumerOptPlotSize.ts

// ------------------------------------------------------------
// 只負責 plot 尺寸計算（px/py 決定長寬比）
// - 把「畫布幾何」從 controller/sceneBuilder 中抽離
// ------------------------------------------------------------

// 集中管理尺寸計算規則
const MIN_POSITIVE_PRICE = 0.1;      // px/py 最小正值 (避免 <= 0)
const MIN_WIDTH_OVER_HEIGHT = 0.1;   // plot 的最小 (寬/高) 比例
const MAX_WIDTH_OVER_HEIGHT = 10;    // plot 的最大 (寬/高) 比例
const MIN_PLOT_SIDE = 1;          // plot 最小邊長 (1 px)


// ------------------------------------------------------------
//  clamp: 把 value 限制在 [minValue, maxValue] 範圍內
// ------------------------------------------------------------
function clamp(value: number, minValue: number, maxValue: number): number {
    if (minValue > maxValue) {
        const temp = minValue;
        minValue = maxValue;
        maxValue = temp;
    }

    if (value < minValue) {
        return minValue;
    }

    if (value > maxValue) {
        return maxValue;
    }

    return value;
}


// ------------------------------------------------------------
//  ensurePositiveFinite: 確保 value 是「有限且 > 0」的數字
//    - 若 value 是 NaN / Infinity / <= 0，回傳 minPositive
// ------------------------------------------------------------
function ensurePositiveFinite(value: number, minPositive: number): number {
    if (!Number.isFinite(value)) {
        return minPositive;
    }
    if (value <= 0) {
        return minPositive;
    }
    return value;
}


export function computePlotInnerSize(args: {
    // 容器內不可用尺寸 (plot 可以使用的最大空間)
    containerInnerWidth: number;
    containerInnerHeight: number;
    px: number;
    py: number;
}): { 
    // 回傳 plot 真正要用的內部尺寸 (px)
    plotInnerWidth: number; 
    plotInnerHeight: number 
} {
    // 1) 取出容器尺寸 (容器是可放置 plot 的框)
    const containerInnerWidth = args.containerInnerWidth;
    const containerInnerHeight = args.containerInnerHeight;

    // 2) 防呆機制: 確保價格是有限且 > 0 (避免除以 0 / NaN / 負值)
    let px = ensurePositiveFinite(args.px, MIN_POSITIVE_PRICE);
    let py = ensurePositiveFinite(args.py, MIN_POSITIVE_PRICE);

    // 3) 計算「plot 目標的 (寬/高) 比例」
    let plotWidthOverHeightTarget = py/px;

    // 4) 避免極端比例: 把 (寬/高) 限制在合理區間，避免 plot 變成一條線
    plotWidthOverHeightTarget = clamp (
        plotWidthOverHeightTarget,
        MIN_WIDTH_OVER_HEIGHT,
        MAX_WIDTH_OVER_HEIGHT
    );

    // 5) 算容器本身的 (寬/高) 比例，用來判斷「誰限制誰」
    const containerWidthOverHeight = containerInnerWidth/containerInnerHeight;

    // 6) fit-inside: 不超出容器的前提下，放入固定 (寬/高) 的 plot
    //  - 容器比較寬 (containerW/H > plotW/H) : 高度吃滿容器，寬度用 高度 * plotW/H 算出
    //  - 容器比較窄 (containerW/H < plotW/H) : 寬度吃滿容器，高度用 寬度 / plotW/H 算出
    let plotInnerWidth = containerInnerWidth;
    let plotInnerHeight = containerInnerHeight;

    if (containerWidthOverHeight > plotWidthOverHeightTarget) {
        // 容器更寬 -> 高度先吃滿 (高度是限制因素)
        plotInnerHeight = containerInnerHeight;
        plotInnerWidth = containerInnerHeight * plotWidthOverHeightTarget;
    } else {
        // 容器更窄/相等 -> 寬度先吃滿 (寬度是限制因素)
        plotInnerWidth = containerInnerWidth;
        plotInnerHeight = containerInnerWidth / plotWidthOverHeightTarget;
    }

    // 7) 最後防呆機制: 尺寸至少 1 px，避免 SVG/互動/座標換算出現奇怪問題
    if (plotInnerWidth < MIN_PLOT_SIDE) {
        plotInnerWidth = MIN_PLOT_SIDE;
    }
    if (plotInnerHeight < MIN_PLOT_SIDE) {
        plotInnerHeight = MIN_PLOT_SIDE;
    }

    // 8) 回傳物件
    return { plotInnerWidth: plotInnerWidth, plotInnerHeight: plotInnerHeight };
}