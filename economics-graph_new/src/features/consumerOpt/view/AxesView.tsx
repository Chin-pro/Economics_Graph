// src/mvc/view/AxesView.tsx

// ------------------------------------------------------------
// View 層（React）元件：AxesView
// 任務：只負責「把座標軸畫出來」
// - 不做任何經濟計算
// - 不做狀態管理
// - 不依賴 Model/Controller
//
// 加入「五等分刻度」與「刻度文字」
//
// 這是典型 MVC 裡 View 的「純渲染元件」：
// Controller/GraphView 算好 innerW/innerH + margin 後，丟給它畫。
// ------------------------------------------------------------

import React from "react";

// 匯入 Margin 型別（讓 props.margin 有 top/right/bottom/left）
// 這裡只 import type：只拿型別，不會進 bundle
import type { Margin } from "../../../core/layout";

// 匯入 Viewport: AxesView 直接使用 Viewport（同一套座標換算規則）
import { Viewport } from "../../../core/viewport";

// 匯入 刻度生成工具
import {
  buildXTicks,
  buildYTicks,
  normalizeTicks,
  type TickStyle,
  type TickVisibility,
} from "./axesTicks"


// ------------------------------------------------------------
//  集中管理 AxesView 的視覺常數（避免 magic number）
// ------------------------------------------------------------
const AXIS_TICK_LEN = 6;
const AXIS_TICK_FONT_SIZE = 11;

const AXIS_LABEL_FONT_SIZE_DEFAULT = 12;
const AXIS_LABEL_FONT_SIZE_MIN = 8;

// yLabel 往左退的額外 padding（避免貼太近 tick label）
const Y_LABEL_EXTRA_PADDING = 18;

// xLabel 往下推的額外 padding（避免貼太近 tick label）
const X_LABEL_EXTRA_PADDING = 8;


// ------------------------------------------------------------
// Props：AxesView 的輸入
// - width/height：內容區(inner)的寬高（不是整張 SVG 外框）
// - margin：留白（用來把座標軸放到內容區的左上角偏移）
//
// - ticks：想要幾等分（你要 5）
//   畫出 i=0..ticks 共 ticks+1 個刻度點
//   例如 ticks=5 -> 0,1,2,3,4,5 共 6 個刻度點（五等分）
// ------------------------------------------------------------
type Props = {
    // 不再傳 width/height/xDomain/yDomain，改傳 viewport
    // width: number;
    // height: number;
    // xDomain: [number, number];
    // yDomain: [number, number];
    viewport: Viewport;

    margin: Margin;

    ticks?: number,

    tickVisibility?: TickVisibility;  // 線段/字體獨立控制

    // plot 區 可用 inner 區塊內的偏移(用於置中)
    // 這個 offset 是「已扣掉 margin 的內容區」內的位移量(往右、往下)
    offset?: { x: number; y: number };

    // 軸變數名稱
    xLabel?: string;
    yLabel?: string;

    // 可分別控制是否顯示
    showXLabel?: boolean;
    showYLabel?: boolean;
};


// ------------------------------------------------------------
// class component（OOP）版本的 View
// - extends React.Component<Props>：表示這個 component 只收 props，不使用 state
//   （如果你要 state，可以寫 React.Component<Props, State>）
// ------------------------------------------------------------
export class AxesView extends React.Component<Props> {
    // ----------------------------------------------------------
    // approxTextWidth：估算文字寬度（避免 DOM measurement）
    // - 每個字寬約 0.6em（粗估）
    // ----------------------------------------------------------
    private approxTextWidth(text: string, fontSize: number): number {
        return text.length * fontSize * 0.6;
    }

    // ----------------------------------------------------------
    // render
    // ----------------------------------------------------------
    render() {
        // --------------------------------------------------------
        // 1) 取 viewport（同一套 mapping）
        // --------------------------------------------------------
        const vp = this.props.viewport;

        const svgInnerWidth = vp.getInnerWidth();
        const svgInnerHeight = vp.getInnerHeight();

        const xEconDomain = vp.getXEconDomain();
        const yEconDomain = vp.getYEconDomain();

        // --------------------------------------------------------
        // 2) margin / offset（offset 用於 plot 置中）
        // --------------------------------------------------------
        const margin = this.props.margin;

        let offset = this.props.offset;
        if (offset === undefined) {
            offset = { x: 0, y: 0 };
        }

        // --------------------------------------------------------
        // 3) ticks 正規化（防呆：undefined / 0 / 負數）
        // --------------------------------------------------------
        const ticks = normalizeTicks(this.props.ticks);

        // --------------------------------------------------------
        // 4) TickStyle（集中）
        // --------------------------------------------------------
        const style: TickStyle = {
            tickLen: AXIS_TICK_LEN,
            fontSize: AXIS_TICK_FONT_SIZE,
        };

        // --------------------------------------------------------
        // 5) TickVisibility 預設值
        // --------------------------------------------------------
        let visibility = this.props.tickVisibility;
        if (visibility === undefined) {
            visibility = { showTickLines: true, showTickLabels: true };
        }

        // --------------------------------------------------------
        // 6) 軸的位置（把 econ 的 0 映射到 pixel）
        // --------------------------------------------------------
        const xAxisYPixel = vp.yEconToYPixel(0);
        const yAxisXPixel = vp.xEconToXPixel(0);

        // --------------------------------------------------------
        // 7) 建刻度 nodes
        // --------------------------------------------------------
        const xTickNodes = buildXTicks({
            vp,
            ticks,
            xAxisYPixel,
            xEconDomain,
            style,
            visibility,
        });

        const yTickNodes = buildYTicks({
            vp,
            ticks,
            yAxisXPixel,
            yEconDomain,
            style,
            visibility,
        });

        // --------------------------------------------------------
        // 8) 軸標籤預設值 + show 開關
        // --------------------------------------------------------
        let xLabel = "x";
        if (this.props.xLabel !== undefined) {
            xLabel = this.props.xLabel;
        }

        let yLabel = "y";
        if (this.props.yLabel !== undefined) {
            yLabel = this.props.yLabel;
        }

        let showX = true;
        if (this.props.showXLabel !== undefined) {
            showX = this.props.showXLabel;
        }

        let showY = true;
        if (this.props.showYLabel !== undefined) {
            showY = this.props.showYLabel;
        }

        // --------------------------------------------------------
        // 9) 避免 label 撞 tick label：估算 tick label 最大寬度
        // --------------------------------------------------------
        const maxAbsY = Math.max(Math.abs(yEconDomain[0]), Math.abs(yEconDomain[1]));
        const tickYSample = maxAbsY.toFixed(2);
        const tickYLabelWidth = this.approxTextWidth(tickYSample, style.fontSize);

        // --------------------------------------------------------
        // 10) 軸標籤字體大小（如果過長就縮小）
        // --------------------------------------------------------
        let xLabelFontSize = AXIS_LABEL_FONT_SIZE_DEFAULT;
        let yLabelFontSize = AXIS_LABEL_FONT_SIZE_DEFAULT;

        const xLabelNeed = this.approxTextWidth(xLabel, xLabelFontSize);

        // yLabel 旋轉後垂直占用 ≈ 文字寬度
        const yLabelNeed = this.approxTextWidth(yLabel, yLabelFontSize);

        const maxAllow = svgInnerHeight * 0.9;

        if (xLabelNeed > maxAllow && xLabel.length > 0) {
            const scaled = maxAllow / (xLabel.length * 0.6);
            if (scaled < xLabelFontSize) {
                xLabelFontSize = Math.max(AXIS_LABEL_FONT_SIZE_MIN, Math.floor(scaled));
            }
        }

        if (yLabelNeed > maxAllow && yLabel.length > 0) {
            const scaled = maxAllow / (yLabel.length * 0.6);
            if (scaled < yLabelFontSize) {
                yLabelFontSize = Math.max(AXIS_LABEL_FONT_SIZE_MIN, Math.floor(scaled));
            }
        }

        // --------------------------------------------------------
        // 11) label 位置
        // --------------------------------------------------------
        const xLabelCenterX = svgInnerWidth / 2;
        const yLabelCenterY = svgInnerHeight / 2;

        // yLabel 往左退：yAxisXPixel - tickLen - tickLabelWidth - padding
        const yLabelX =
            yAxisXPixel - style.tickLen - tickYLabelWidth - Y_LABEL_EXTRA_PADDING;

        // --------------------------------------------------------
        // 12) JSX：用 <g> 做 margin+offset 平移
        // --------------------------------------------------------
        let xLabelNode: React.ReactNode = null;
        if (showX) {
            xLabelNode = (
            <text
                x={xLabelCenterX}
                y={xAxisYPixel + style.tickLen + style.fontSize * 2 + X_LABEL_EXTRA_PADDING}
                fontSize={xLabelFontSize}
                textAnchor="middle"
                fill="currentColor"
            >
                {xLabel}
            </text>
            );
        }

        // [CHANGED] yLabel 加上 rotate(-90 ...)
        // - 旋轉中心點：以 (yLabelX, yLabelCenterY) 為 pivot
        let yLabelNode: React.ReactNode = null;
        if (showY) {
            yLabelNode = (
            <text
                x={yLabelX}
                y={yLabelCenterY}
                fontSize={yLabelFontSize}
                textAnchor="middle"
                fill="currentColor"
                // transform={`rotate(-90 ${yLabelX} ${yLabelCenterY}`}
            >
                {yLabel}
            </text>
            );
        }

        return (
            <g transform={`translate(${margin.left + offset.x},${margin.top + offset.y})`}>
            {/* x-axis（水平線） */}
            <line
                x1={0}
                y1={xAxisYPixel}
                x2={svgInnerWidth}
                y2={xAxisYPixel}
                stroke="currentColor"
            />

            {/* y-axis（垂直線） */}
            <line
                x1={yAxisXPixel}
                y1={0}
                x2={yAxisXPixel}
                y2={svgInnerHeight}
                stroke="currentColor"
            />

            {/* ticks */}
            {xTickNodes}
            {yTickNodes}

            {/* axis labels */}
            {xLabelNode}
            {yLabelNode}
            </g>
        );
    }
}
