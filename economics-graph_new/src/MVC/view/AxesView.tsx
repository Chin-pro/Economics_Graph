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
import type { Margin } from "../../core/types";

// =========================================================
//  AxesView 直接使用 Viewport（同一套座標換算規則）
// =========================================================
import { Viewport } from "../../core/Viewport";

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
};

// ------------------------------------------------------------
// formatTick：控制刻度文字顯示格式
// 想顯示整數、小數幾位，都改這裡就好
// ------------------------------------------------------------
function formatTick(value: number) {
  return value.toFixed(2);
}

// ------------------------------------------------------------
// class component（OOP）版本的 View
// - extends React.Component<Props>：表示這個 component 只收 props，不使用 state
//   （如果你要 state，可以寫 React.Component<Props, State>）
// ------------------------------------------------------------
export class AxesView extends React.Component<Props> {
  // render()：class component 必備方法
  // React 會在「第一次掛載」或「props 改變」時呼叫 render 重新產出 JSX
  render() {
    // --------------------------------------------------------
    // 把 props 解出來，讓下面 JSX 讀起來更清楚
    // 也可以用解構：const { width, height, margin } = this.props;
    // 解構讀取 xDomain 與 yDomain
    //
    // [修改]: 改從 viewport 取得 size/domain (同一份座標系)
    // --------------------------------------------------------
    // const width = this.props.width;
    // const height = this.props.height;
    // const xMin = this.props.xDomain[0];
    // const xMax = this.props.xDomain[1];
    // const yMin = this.props.yDomain[0];
    // const yMax = this.props.yDomain[1];
    const vp = this.props.viewport;
    const svgInnerWidth = vp.getInnerWidth();      // 內容區寬度
    const svgInnerHeight = vp.getInnerHeight();    // 內容區高度
    const xEconDomain = vp.getXEconDomain();  // 經濟座標 x 的範圍 [xMin, xMax]
    const yEconDomain = vp.getYEconDomain();  // 經濟座標 y 的範圍 [yMin, yMax]
    
    const xEconMin = xEconDomain[0];
    const xEconMax = xEconDomain[1];
    const yEconMin = yEconDomain[0];
    const yEconMax = yEconDomain[1];

    const margin = this.props.margin;
    
    // ticks 預設值: 如果沒傳入，就使用 5
    let ticks = this.props.ticks;
    if (ticks === undefined) {
      ticks = 5;
    }

    // 防呆: ticks 至少要 1
    if (ticks < 1) {
      ticks = 1;
    }

    // range (domain 長度)
    const xEconRange = xEconMax - xEconMin;
    const yEconRange = yEconMax - yEconMin;

    // 刻度的視覺參數
    const tickLen = 6;
    const fontSize = 11;

    // 軸線位置改為「經濟座標 0」在 viewport 中的像素位置
    //  - X 軸是一條水平線，所以它最重要的是「它的 y 值是多少」
    //  - Y 軸是一條垂直線，所以它最重要的是「它的 x 值是多少」
    const xAxisY = vp.yEconToYPixel(0);  // 經濟座標 y=0 的 y 像素座標
    const yAxisX = vp.xEconToXPixel(0);  // 經濟座標 x=0 的 x 像素座標

    // --------------------------------------------------------
    // 計算刻度（X 軸與 Y 軸）
    //
    // 核心概念：
    // 1) 刻度位置（像素）：
    //    - x 軸：從 0 到 width
    //      xPix = (i / ticks) * width
    //
    //    - y 軸：從 0 到 height（但 SVG 的 y 是往下增加）
    //      我們希望「y=0 在下方」更像數學座標，所以用：
    //      yPix = height - (i / ticks) * height
    //
    // 2) 刻度文字（domain 的值）：
    //    - xVal = xMin + (i / ticks) * (xMax - xMin)
    //    - yVal = yMin + (i / ticks) * (yMax - yMin)
    //
    // 這樣就能做到「五等分顯示值」
    const xTickNodes: React.ReactNode[] = [];  // xTickNodes 就是一個「裝 React 元素」的陣列
    const yTickNodes: React.ReactNode[] = [];  // yTickNodes 就是一個「裝 React 元素」的陣列

    let i = 0;
    while (i <= ticks) {
      const t = i/ticks;  // t 介於 0-1
      
      // -------------------------
      // X axis ticks
      //
      // [修改]: X ticks: 先計算經濟座標值(或加 padding/zoom)，再用 vp.x(...) 計算像素位置
      // -------------------------
      // const xPix = t*width;
      // const xVal = xMin + t*xRange;
      const xEconVal = xEconMin + t * xEconRange;  // 這個刻度在「經濟座標」的數值
      const xPixel = vp.xEconToXPixel(xEconVal);    // 把經濟座標換成「像素 xPixel」

      xTickNodes.push(
        <g key={`xtick-${i}`}>
          {/* 刻度線: 從 (xPix, height) 往下畫 tickLen */}
          <line
            x1 = {xPixel}
            y1 = {xAxisY}
            x2 = {xPixel}
            y2 = {xAxisY + tickLen}
            stroke = "currentColor"
          />
          {/* 刻度文字：置中對齊 */}
          <text
            x = {xPixel}
            y = {xAxisY + tickLen + fontSize}
            fontSize = {fontSize}
            textAnchor = "middle"
            fill = "currentColor"
          >
            {formatTick(xEconVal)}
          </text>
        </g>
      );

      // -------------------------
      // Y axis ticks
      //
      // [修改]: Y ticks: 先計算經濟座標值(或加 padding/zoom)，再用 vp.y(...) 計算像素位置
      // -------------------------
      // yPix 從底往上
      // const yPix = (1-t) * height;
      // const yVal = yMin + t * yRange;
      const yEconVal = yEconMin + t * yEconRange;  // 經濟座標 yEcon 的刻度值
      const yPixel = vp.yEconToYPixel(yEconVal);   // 換成像素 yPixel（注意會反轉）

      yTickNodes.push(
        <g key={`ytick-${i}`}>
          {/* 刻度線：從 (0, yPix) 往左畫 tickLen */}
          <line
            x1 = {yAxisX}
            y1 = {yPixel}
            x2 = {yAxisX - tickLen}
            y2 = {yPixel}
            stroke = "currentColor"
          />
          {/* 刻度文字：右對齊貼近 y 軸 */}
          <text
            x = {yAxisX - tickLen - 2}
            y = {yPixel + fontSize / 3}
            fontSize = {fontSize}
            textAnchor = "end"
            fill = "currentColor"
          >
            {formatTick(yEconVal)}
          </text>
        </g>
      );

      i++;
    }


    // --------------------------------------------------------
    // 回傳 SVG 的 <g> 群組（group）
    // 用 transform translate(margin.left, margin.top) 做位移：
    // 目的：把座標軸放在「內容區」的左上角，而不是整個 SVG 的 (0,0)
    //
    // 假設你的外框 SVG 先畫了 margin，內容區才是 innerW/innerH，
    // 那你把 <g> 往右下移動 margin.left/margin.top，
    // 就能讓 (0,0) 對齊內容區左上角。
    // --------------------------------------------------------
    return (
      <g transform={`translate(${margin.left},${margin.top})`}>
        {/* -----------------------------------------------
            x-axis：水平線
            - 從 (0, height) 畫到 (width, height)
            - 因為內容區的 y=0 在上方，y=height 在下方
            - 所以 x 軸（底線）放在 y=height
            ----------------------------------------------- */}
        <line
          x1={0}
          y1={xAxisY}
          x2={svgInnerWidth}
          y2={xAxisY}
          stroke="currentColor"
        />

        {/* -----------------------------------------------
            y-axis：垂直線
            - 從 (0, 0) 畫到 (0, height)
            - 放在內容區最左邊（x=0）
            ----------------------------------------------- */}
        <line 
          x1={yAxisX} 
          y1={0} 
          x2={yAxisX} 
          y2={svgInnerHeight} 
          stroke="currentColor" 
        />

        {/* 畫出刻度（X 軸、Y 軸） */}
        {xTickNodes}
        {yTickNodes}
      </g>
    );
  }
}
