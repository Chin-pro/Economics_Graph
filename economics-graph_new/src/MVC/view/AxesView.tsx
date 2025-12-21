// src/mvc/view/AxesView.tsx

// ------------------------------------------------------------
// View 層（React）元件：AxesView
// 任務：只負責「把座標軸畫出來」
// - 不做任何經濟計算
// - 不做狀態管理
// - 不依賴 Model/Controller
//
// 這是典型 MVC 裡 View 的「純渲染元件」：
// Controller/GraphView 算好 innerW/innerH + margin 後，丟給它畫。
// ------------------------------------------------------------

import React from "react";

// 匯入 Margin 型別（讓 props.margin 有 top/right/bottom/left）
// 這裡只 import type：只拿型別，不會進 bundle
import type { Margin } from "../../core/types";

// ------------------------------------------------------------
// Props：AxesView 的輸入
// - width/height：內容區(inner)的寬高（不是整張 SVG 外框）
// - margin：留白（用來把座標軸放到內容區的左上角偏移）
// ------------------------------------------------------------
type Props = {
  width: number;
  height: number;
  margin: Margin;
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
    // 你也可以用解構：const { width, height, margin } = this.props;
    // --------------------------------------------------------
    const width = this.props.width;
    const height = this.props.height;
    const margin = this.props.margin;

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
          y1={height}
          x2={width}
          y2={height}
          stroke="currentColor"
        />

        {/* -----------------------------------------------
            y-axis：垂直線
            - 從 (0, 0) 畫到 (0, height)
            - 放在內容區最左邊（x=0）
            ----------------------------------------------- */}
        <line x1={0} y1={0} x2={0} y2={height} stroke="currentColor" />
      </g>
    );
  }
}
