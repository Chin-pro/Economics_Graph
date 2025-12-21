// src/mvc/view/ConsumerOptGraphView.tsx

// ------------------------------------------------------------
// ConsumerOptGraphView（View 層 / React class component）
// 任務：
// 1) 提供 SVG 畫布容器（W/H/margin/innerW/innerH）
// 2) 管理 View 的 state(scene)：scene 一更新就 setState 觸發重畫
// 3) 訂閱 Controller：controller 產生新 scene 時通知我
// 4) 把 scene 丟給 SvgSceneView（renderer）去畫 drawables
// 5) 接收 SvgSceneView 的互動事件（拖曳點）並轉交給 Controller
//
// 它不做經濟計算（那是 Model）
// 它也不組裝 drawables（那是 Controller buildScene）
// 它只負責「呈現 + UI 事件轉交 + 訂閱更新」
// ------------------------------------------------------------

import React from "react";

// Margin 型別：{top,right,bottom,left}
// margin 用於內容區偏移（座標軸、繪圖區留白）
import type { Margin } from "../../core/types";

// AxesView：專門畫座標軸（只畫，不算）
import { AxesView } from "./AxesView";

// SvgSceneView：renderer，把 SceneOutput.drawables 畫成 SVG 元素
import { SvgSceneView } from "./SvgSceneView";

// SceneOutput：這張圖的「唯一渲染輸入」
// 內含 drawables + xDomain/yDomain + width/height
import type { SceneOutput } from "../../core/drawables";

// Controller：GraphView 需要一個 controller 來取得 scene、訂閱更新、轉交拖曳事件
import { ConsumerOptController } from "../controller/ConsumerOptController";

// ------------------------------------------------------------
// Props：外部（通常是 AppView）必須傳入 controller
// GraphView 不自己 new controller，避免把依賴鎖死
// ------------------------------------------------------------
type Props = {
  controller: ConsumerOptController;
};

// ------------------------------------------------------------
// State：GraphView 自己持有目前的 scene
// 這是 React class component 的典型模式：
// - scene 變了 -> setState -> render 重新執行 -> 重畫 SVG
// ------------------------------------------------------------
type State = {
  scene: SceneOutput;
};

// ------------------------------------------------------------
// ConsumerOptGraphView：class component（OOP）
// extends React.Component<Props, State> 代表：
// - props 型別是 Props
// - state 型別是 State
// ------------------------------------------------------------
export class ConsumerOptGraphView extends React.Component<Props, State> {
  // ----------------------------------------------------------
  // 固定的「視圖配置」：W/H/margin
  //
  // 用 private readonly：
//  - private：外部不能直接改（封裝）
//  - readonly：建構後不可變（避免 render 期間被改動）
// ----------------------------------------------------------
  private readonly W: number;
  private readonly H: number;
  private readonly margin: Margin;

  // ----------------------------------------------------------
  // constructor：初始化 view 的常數、state、事件綁定、訂閱 controller
  // ----------------------------------------------------------
  constructor(props: Props) {
    super(props); // 必須呼叫 super(props)，讓 React 初始化 Component

    // SVG 外框尺寸（整張畫布）
    this.W = 520;
    this.H = 360;

    // 留白：讓座標軸 / 標籤可以放得下
    // 內容區（inner）就是扣掉 margin 後的範圍
    this.margin = { top: 20, right: 20, bottom: 30, left: 40 };

    // --------------------------------------------------------
    // 初始化 state.scene
    // - props.controller.getScene()：向 controller 取得「目前最新」scene
    // - getScene() 內部可能會 lazy build
    // - 結果存進 state，第一次 render 就能畫出來
    // --------------------------------------------------------
    this.state = { scene: props.controller.getScene() };

    // --------------------------------------------------------
    // 綁定 this（class component 必做）
    // 因為你下面會把 method 當 callback 傳遞出去：
    // - controller.subscribe(this.handleSceneUpdate)
    // - <SvgSceneView onPointDrag={this.handlePointDrag} />
    //
    // 若不 bind，method 內的 this 可能會變成 undefined（嚴格模式）
    // --------------------------------------------------------
    this.handleSceneUpdate = this.handleSceneUpdate.bind(this);
    this.handlePointDrag = this.handlePointDrag.bind(this);

    // --------------------------------------------------------
    // ✅ 訂閱 controller：這就是你前面問的「訂閱者」！
    //
    // 你把一個 callback（handleSceneUpdate）交給 controller，
    // controller 之後每次重算 scene 都會呼叫這個 callback(scene)。
    //
    // 所以：
    // - 訂閱者（listener）= this.handleSceneUpdate 這個函式
    // - 擁有者 = GraphView（View 層）
    // --------------------------------------------------------
    props.controller.subscribe(this.handleSceneUpdate);
  }

  // ----------------------------------------------------------
  // componentWillUnmount：元件要卸載時解除訂閱
  //
  // 為什麼一定要做？
  // - 若不 unsubscribe，controller 仍保存這個 callback reference
  // - 元件都消失了，controller 還呼叫 setState -> 會警告/記憶體洩漏
  // ----------------------------------------------------------
  componentWillUnmount() {
    this.props.controller.unsubscribe(this.handleSceneUpdate);
  }

  // ----------------------------------------------------------
  // handleSceneUpdate：controller 通知我「新 scene」時會呼叫
  //
  // - 這個 method 會 setState
  // - setState 會觸發 render
  // - render 會把新 scene 丟進 SvgSceneView 重畫
  // ----------------------------------------------------------
  private handleSceneUpdate(scene: SceneOutput) {
    this.setState({ scene });
  }

  // ----------------------------------------------------------
  // handlePointDrag：SvgSceneView 拖曳事件回報入口
  //
  // - SvgSceneView 回報的是 (id, pixel)
  // - GraphView 不解讀拖曳含義，只轉交給 controller
  // - controller 決定要怎麼處理（例如回推 a、重算 scene、通知 view）
  // ----------------------------------------------------------
  private handlePointDrag(id: string, pixel: { x: number; y: number }) {
    this.props.controller.onPointDrag(id, pixel);
  }

  // ----------------------------------------------------------
  // render：把目前 state.scene 畫出來
  // ----------------------------------------------------------
  render() {
    // 內容區尺寸（innerW/innerH）：
    // - 用於座標軸長度、Viewport 寬高
    // - 注意：這裡 GraphView 算 innerW/innerH，Controller 也要一致
    //   否則拖曳 pixel<->econ 轉換會出現比例差
    const innerW = this.W - this.margin.left - this.margin.right;
    const innerH = this.H - this.margin.top - this.margin.bottom;

    return (
      // SVG 外框：畫布容器
      <svg width={this.W} height={this.H} style={{ border: "1px solid #ddd" }}>
        {/* AxesView 自己會 translate(margin.left, margin.top) */}
        <AxesView width={innerW} height={innerH} margin={this.margin} />

        {/* 內容區的群組 <g>：把 (0,0) 移到內容區左上角 */}
        <g transform={`translate(${this.margin.left},${this.margin.top})`}>
          {/* SvgSceneView：吃 scene.drawables 畫出 budget/indiff/opt/text
              同時把拖曳事件回報給 GraphView */}
          <SvgSceneView
            scene={this.state.scene}
            onPointDrag={this.handlePointDrag}
          />
        </g>
      </svg>
    );
  }
}
