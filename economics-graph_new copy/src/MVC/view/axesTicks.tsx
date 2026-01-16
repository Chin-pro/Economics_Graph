// src/mvc/view/axesTicks.tsx

// ------------------------------------------------------------
// 專門「生成刻度 JSX」
// 也就是把原本 AxesView.render() 裡的 while/push 抽出來
//
// 1) AxesView.render() 會變短、更容易讀
// 2) 刻度生成邏輯可以被其他圖表重用（未來你不只畫一張圖）
// 3) 這裡是「純渲染邏輯」：不碰 state / 不碰 model / 不改 controller
//
// 重要概念：
// - 這些函式只回傳 React.ReactNode[]（一堆 JSX）
// - 誰來 render？AxesView 來 render
// ------------------------------------------------------------

import React from "react";
import { Viewport } from "../../core/Viewport";

// ------------------------------------------------------------
// 你刻度文字的格式化函式：
// 如果你未來想改成顯示整數、顯示 1 位小數、或加上單位，改這裡即可。
// ------------------------------------------------------------
export function formatTick(value: number) {
    return value.toFixed(2);
}

// ------------------------------------------------------------
// 視覺參數集中成一個型別：
// 讓 buildXTicks / buildYTicks 的參數更乾淨、更 self-interpret
// ------------------------------------------------------------
export type TickStyle = {
    tickLen: number;
    fontSize: number;
};

// ------------------------------------------------------------
// 刻度顯示控制：線 和 字體 分開
// ------------------------------------------------------------
export type TickVisibility = {
    showTickLines: boolean;   // 刻度短線
    showTickLabels: boolean;  // 刻度文字
};


// ------------------------------------------------------------
// normalizeTicks：統一 ticks 的預設值與防呆
// - ticks 沒傳 -> 預設 5
// - ticks < 1 -> 強制變 1
// ------------------------------------------------------------
export function normalizeTicks(ticks?: number): number {
    let safeTicks = ticks;
    if (safeTicks === undefined) {
        safeTicks = 5;
    }
    if (safeTicks < 1) {
        safeTicks = 1;
    }
    return safeTicks;
}

// ------------------------------------------------------------
// buildXTicks：建立 X 軸刻度（回傳 JSX 陣列）
// - 把 xEconDomain（經濟座標範圍）平均切成 ticks 份
// - 每一份算出一個 xEconVal
// - 用 Viewport 把 xEconVal 轉成 xPixel
// - 在 (xPixel, xAxisYPixel) 畫刻度線 + 文字
//
// 參數解釋：
// - vp：負責把 econ -> pixel 的工具
// - ticks：要切幾等分（5 等分）
// - xAxisYPixel：X 軸那條線在畫面上的 yPixel（水平線，所以 y 最重要）
// - xEconDomain：x 的經濟座標範圍 [min, max]
// - style：刻度線長度、字體大小
// ------------------------------------------------------------
export function buildXTicks(args: {
    vp: Viewport;
    ticks: number;
    xAxisYPixel: number;
    xEconDomain: [number, number];
    style: TickStyle;
    visibility: TickVisibility;
}): React.ReactNode[] {
    const { vp, ticks, xAxisYPixel, xEconDomain, style, visibility } = args;

    // 若線段和字體都不顯示，就不用產生任何 ticks (避免產生一對空 <g>)
    if (!visibility.showTickLines && !visibility.showTickLabels) {
        return [];
    }

    const xEconMin = xEconDomain[0];
    const xEconMax = xEconDomain[1];
    const xEconRange = xEconMax - xEconMin;

    const xTickNodes: React.ReactNode[] = [];

    let i = 0;
    while (i <= ticks) {
        const t = i / ticks; // 0..1 的比例
        const xEconVal = xEconMin + t * xEconRange; // 這個刻度在經濟座標的值
        const xPixel = vp.xEconToXPixel(xEconVal);  // 經濟座標 -> 像素座標

        // 依照條件建立 Node List (刻度，包含線段與字體)
        let tickLineNode: React.ReactNode | null = null;
        if (visibility.showTickLines) {
            tickLineNode = (
                <line
                    x1={xPixel}
                    y1={xAxisYPixel}
                    x2={xPixel}
                    y2={xAxisYPixel + style.tickLen}
                    stroke="currentColor"
                />
            );
        }

        let tickLabelNode: React.ReactNode | null = null;
        if (visibility.showTickLabels) {
            tickLabelNode = (
                <text
                    x={xPixel}
                    y={xAxisYPixel + style.tickLen + style.fontSize}
                    fontSize={style.fontSize}
                    textAnchor="middle"
                    fill="currentColor"
                >
                    {formatTick(xEconVal)}
                </text>
            );
        }


        xTickNodes.push(
            <g key={`xtick-${i}`}>
                {/* 刻度線：從 X 軸往下畫 tickLen */}
                {/* <line
                    x1={xPixel}
                    y1={xAxisYPixel}
                    x2={xPixel}
                    y2={xAxisYPixel + style.tickLen}
                    stroke="currentColor"
                    /> */}

                {/* 刻度文字：置中對齊 */}
                {/* <text
                    x={xPixel}
                    y={xAxisYPixel + style.tickLen + style.fontSize}
                    fontSize={style.fontSize}
                    textAnchor="middle"
                    fill="currentColor"
                    >
                    {formatTick(xEconVal)}
                    </text> */}

                {tickLineNode}
                {tickLabelNode}
            </g>
        );

        i += 1;
    }

    return xTickNodes;
}

// ------------------------------------------------------------
// buildYTicks：建立 Y 軸刻度（回傳 JSX 陣列）
// - 把 yEconDomain（經濟座標範圍）平均切成 ticks 份
// - 每一份算出 yEconVal
// - 用 Viewport 把 yEconVal 轉成 yPixel
// - 在 (yAxisXPixel, yPixel) 畫刻度線 + 文字
//
// 參數解釋：
// - yAxisXPixel：Y 軸那條線在畫面上的 xPixel（垂直線，所以 x 最重要）
// ------------------------------------------------------------
export function buildYTicks(args: {
    vp: Viewport;
    ticks: number;
    yAxisXPixel: number;
    yEconDomain: [number, number];
    style: TickStyle;
    visibility: TickVisibility;
}): React.ReactNode[] {
    const { vp, ticks, yAxisXPixel, yEconDomain, style, visibility } = args;

    // 若線段和字體都不顯示，就不用產生任何 ticks (避免產生一對空 <g>)
    if (!visibility.showTickLines && !visibility.showTickLabels) {
        return [];
    }

    const yEconMin = yEconDomain[0];
    const yEconMax = yEconDomain[1];
    const yEconRange = yEconMax - yEconMin;

    const yTickNodes: React.ReactNode[] = [];

    let i = 0;
    while (i <= ticks) {
        const t = i / ticks; // 0..1 的比例
        const yEconVal = yEconMin + t * yEconRange; // 這個刻度在經濟座標的值
        const yPixel = vp.yEconToYPixel(yEconVal);  // 經濟座標 -> 像素座標

        // 依照條件建立 Node List (刻度，包含線段與字體)
        let tickLineNode: React.ReactNode | null = null;
        if (visibility.showTickLines) {
            tickLineNode = (
                <line
                    x1={yAxisXPixel}
                    y1={yPixel}
                    x2={yAxisXPixel - style.tickLen}
                    y2={yPixel}
                    stroke="currentColor"
                />
            );
        }

        let tickLabelNode: React.ReactNode | null = null;
        if (visibility.showTickLabels) {
            tickLabelNode = (
                <text
                    x={yAxisXPixel - style.tickLen - 2}
                    y={yPixel + style.fontSize / 3}
                    fontSize={style.fontSize}
                    textAnchor="end"
                    fill="currentColor"
                >
                    {formatTick(yEconVal)}
                </text>
            );
        }


        yTickNodes.push(
            <g key={`ytick-${i}`}>
                {/* 刻度線：從 Y 軸往左畫 tickLen */}
                {/* <line
                    x1={yAxisXPixel}
                    y1={yPixel}
                    x2={yAxisXPixel - style.tickLen}
                    y2={yPixel}
                    stroke="currentColor"
                /> */}

                {/* 刻度文字：右對齊貼近 y 軸 */}
                {/* <text
                    x={yAxisXPixel - style.tickLen - 2}
                    y={yPixel + style.fontSize / 3}
                    fontSize={style.fontSize}
                    textAnchor="end"
                    fill="currentColor"
                >
                    {formatTick(yEconVal)}
                </text> */}

                {tickLineNode}
                {tickLabelNode}
            </g>
        );

        i += 1;
    }

    return yTickNodes;
}
