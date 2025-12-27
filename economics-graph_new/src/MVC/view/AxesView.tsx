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

// 匯入 Viewport: AxesView 直接使用 Viewport（同一套座標換算規則）
import { Viewport } from "../../core/Viewport";

// 匯入 刻度生成工具
import {
  buildXTicks,
  buildYTicks,
  normalizeTicks,
  type TickStyle,
  type TickVisibility,
} from "./axesTicks"

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
};


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
    
    const vp = this.props.viewport;
    const svgInnerWidth = vp.getInnerWidth();      // 內容區寬度
    const svgInnerHeight = vp.getInnerHeight();    // 內容區高度
    const xEconDomain = vp.getXEconDomain();  // 經濟座標 x 的範圍 [xMin, xMax]
    const yEconDomain = vp.getYEconDomain();  // 經濟座標 y 的範圍 [yMin, yMax]
    

    const margin = this.props.margin;
    

    // normalizeTicks(): ticks 的預設與防呆機制
    const ticks = normalizeTicks(this.props.ticks);

    // 刻度視覺參數 (集中成 TickStyle)
    const style: TickStyle = {
      tickLen: 6,
      fontSize: 11
    }

    // 預設: 線段與字體皆顯示
    let visibility = this.props.tickVisibility;
    if ( visibility === undefined ) {
      visibility = { showTickLines: true, showTickLabels: true}
    }

    // offset 預設 0
    let offset = this.props.offset;
    if (offset === undefined) {
      offset = { x: 0, y: 0 };
    }


    // --------------------------------------------------------
    // xAxisY / yAxisX ：
    //
    // 1) X 軸是「水平線」——水平線的位置由「y」決定
    //   (X 軸是一條水平線，所以它最重要的是「它的 y 值是多少」)
    //    所以 xAxisY 的意思是：
    //    「X 軸那條水平線，在畫面上的 yPixel 在哪裡？」
    //
    // 2) Y 軸是「垂直線」——垂直線的位置由「x」決定
    //   (Y 軸是一條垂直線，所以它最重要的是「它的 x 值是多少」)
    //    所以 yAxisX 的意思是：
    //    「Y 軸那條垂直線，在畫面上的 xPixel 在哪裡？」
    //
    // 我們用 Viewport 把「經濟座標的 0」換成像素：
    // - yEcon=0 => yPixel (就是 x 軸的位置)
    // - xEcon=0 => xPixel (就是 y 軸的位置)
    // --------------------------------------------------------
    const xAxisYPixel = vp.yEconToYPixel(0);  // 經濟座標 y=0 的 y 像素座標
    const yAxisXPixel = vp.xEconToXPixel(0);  // 經濟座標 x=0 的 x 像素座標


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
    // 回傳 SVG 的 <g> 群組（group）
    // 用 transform translate(margin.left, margin.top) 做位移：
    // 目的：把座標軸放在「內容區」的左上角，而不是整個 SVG 的 (0,0)
    //
    // 假設你的外框 SVG 先畫了 margin，內容區才是 innerW/innerH，
    // 那你把 <g> 往右下移動 margin.left/margin.top，
    // 就能讓 (0,0) 對齊內容區左上角。
    //
    // margin：把座標軸放到內容區左上
    // offset：把 plot 區在內容區內置中，確保 軸 和 圖 在同一個 plot 區座標系下
    // --------------------------------------------------------
    return (
      <g transform={`translate(${margin.left + offset.x},${margin.top + offset.y})`}>
        {/* -----------------------------------------------
            x-axis：水平線
            - 從 (0, height) 畫到 (width, height)
            - 因為內容區的 y=0 在上方，y=height 在下方
            - 所以 x 軸（底線）放在 y=height
            ----------------------------------------------- */}
        <line
          x1={0}
          y1={xAxisYPixel}
          x2={svgInnerWidth}
          y2={xAxisYPixel}
          stroke="currentColor"
        />

        {/* -----------------------------------------------
            y-axis：垂直線
            - 從 (0, 0) 畫到 (0, height)
            - 放在內容區最左邊（x=0）
            ----------------------------------------------- */}
        <line 
          x1={yAxisXPixel} 
          y1={0} 
          x2={yAxisXPixel} 
          y2={svgInnerHeight} 
          stroke="currentColor" 
        />

        {/* 由 visibility 決定是否出現線/字體，畫出刻度（X 軸、Y 軸） */}
        {xTickNodes}
        {yTickNodes}
      </g>
    );
  }
}
