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

// // Margin 型別：{top,right,bottom,left}
// // margin 用於內容區偏移（座標軸、繪圖區留白）
// import type { Margin } from "../../core/types";

// AxesView：專門畫座標軸（只畫，不算）
import { AxesView } from "./AxesView";

// SvgSceneView：renderer，把 SceneOutput.drawables 畫成 SVG 元素
import { SvgSceneView } from "./SvgSceneView";

// SceneOutput：這張圖的「唯一渲染輸入」
// 內含 drawables + xDomain/yDomain + width/height
import type { SceneOutput } from "../../core/drawables";

// Controller：GraphView 需要一個 controller 來取得 scene、訂閱更新、轉交拖曳事件
import { ConsumerOptController } from "../controller/ConsumerOptController";

// GraphView: GraphView 的 state 也保存 viewport
import { Viewport } from "../../core/Viewport";

import type { TickVisibility } from "./axesTicks";

import { SVG_HEIGHT, SVG_MARGIN, SVG_WIDTH } from "../../core/layout";

// // ------------------------------------------------------------
// // ALLOWED_TICKS: 限制 ticks 值: 避免奇怪數字 (1, 2, 4, 5, 10)
// // ------------------------------------------------------------
// const ALLOWED_TICKS: number[] = [1, 2, 4, 5, 10]; 

// ------------------------------------------------------------
// Props：外部（通常是 AppView）必須傳入 controller
// GraphView 不自己 new controller，避免把依賴鎖死
// ------------------------------------------------------------
type Props = {
  controller: ConsumerOptController;

  ticks: number;
  tickVisibility: TickVisibility;

  xLabel: string;
  yLabel: string;

  // 是否顯示 axis labels
  showXLabel: boolean;
  showYLabel: boolean;

  // 新增: 標題顯示與自體
  chartTitle: string;
  showChartTitle: boolean;
  chartTitleFontSize: number;
};

// ------------------------------------------------------------
// State：GraphView 自己持有目前的 scene
// 這是 React class component 的典型模式：
// - scene 變了 -> setState -> render 重新執行 -> 重畫 SVG
// Viewport: 確保 Viewport 與 scene 同步
// ------------------------------------------------------------
type State = {
  scene: SceneOutput;
  viewport: Viewport;

  // ticks: number;
  // showTickLines: boolean;
  // showTickLabels: boolean;
};

// ------------------------------------------------------------
// ConsumerOptGraphView：class component（OOP）
// extends React.Component<Props, State> 代表：
// - props 型別是 Props
// - state 型別是 State
// ------------------------------------------------------------
export class ConsumerOptGraphView extends React.Component<Props, State> {
  // ----------------------------------------------------------
  // 固定的「視圖配置」：svgWidth/svgHeight/svgMargin
  //
  // 用 private readonly：
  //  - private：外部不能直接改（封裝）
  //  - readonly：建構後不可變（避免 render 期間被改動）
  // ----------------------------------------------------------
  private readonly svgWidth: number;
  private readonly svgHeight: number;

  // private readonly svgMargin: Margin;
  private readonly svgMargin = SVG_MARGIN;

  private subscribedController: ConsumerOptController | null;

  // 拿到 <svg> DOM 匯出使用
  private svgRef: React.RefObject<SVGSVGElement | null>;

  // ----------------------------------------------------------
  // constructor：初始化 view 的常數、state、事件綁定、訂閱 controller
  // ----------------------------------------------------------
  constructor(props: Props) {
    super(props); // 必須呼叫 super(props)，讓 React 初始化 Component

    // SVG 外框尺寸（整張畫布）
    this.svgWidth = SVG_WIDTH;
    this.svgHeight = SVG_HEIGHT;

    // 留白：讓座標軸 / 標籤可以放得下
    // 內容區（inner）就是扣掉 margin 後的範圍，中間那塊「真正拿來畫圖的區域」
    //  - innerW = W - margin.left - margin.right
    //  - innerH = H - margin.top - margin.bottom
    // 為甚麼要留白?
    //  - 左邊要放 Y 軸的數字（刻度文字），不留白會被切掉
    //  - 下方要放 X 軸的數字，不留白會被切掉
    this.svgMargin = { top: 20, right: 20, bottom: 30, left: 40 };

    // svg ref: 拿到真正的 <svg> DOM 節點
    this.svgRef = React.createRef<SVGSVGElement>();

    // --------------------------------------------------------
    // 初始化 state.scene
    // - props.controller.getScene()：向 controller 取得「目前最新」scene
    // - getScene() 內部可能會 lazy build
    // - 結果存進 state，第一次 render 就能畫出來
    // --------------------------------------------------------
    const scene = props.controller.getScene();
    const viewport = props.controller.getViewport();

    this.state = { 
      scene, 
      viewport,
      // ticks: 5,
      // showTickLines: true,
      // showTickLabels: true,
    };

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

    // bind Tick handlers
    // this.handleOnTicksChange = this.handleOnTicksChange.bind(this);
    // this.handleOnShowTickLinesChange = this.handleOnShowTickLinesChange.bind(this);
    // this.handleOnShowTickLabelsChange = this.handleOnShowTickLabelsChange.bind(this);

    // 文字拖曳
    this.handleTextDrag = this.handleTextDrag.bind(this);


    // // 匯出 SVG handler
    // this.handleExportSvg = this.handleExportSvg.bind(this);

    // --------------------------------------------------------
    // 訂閱 controller：這就是你前面問的「訂閱者」！
    //
    // 你把一個 callback（handleSceneUpdate）交給 controller，
    // controller 之後每次重算 scene 都會呼叫這個 callback(scene)。
    //
    // 所以：
    // - 訂閱者（listener）= this.handleSceneUpdate 這個函式
    // - 擁有者 = GraphView（View 層）
    // --------------------------------------------------------
    // props.controller.subscribe(this.handleSceneUpdate);
    this.subscribedController = null;
  }

  // ----------------------------------------------------------
  // componentDidMount：元件要卸載時解除訂閱
  //
  // 為什麼一定要做？ 
  // 訂閱 controller：這就是你前面問的「訂閱者」！
  //
  // 你把一個 callback（handleSceneUpdate）交給 controller，
  // controller 之後每次重算 scene 都會呼叫這個 callback(scene)。
  //
  // 所以：
  // - 訂閱者（listener）= this.handleSceneUpdate 這個函式
  // - 擁有者 = GraphView（View 層）

  // ----------------------------------------------------------
  componentDidMount() {
    this.subscribedController = this.props.controller;
    this.subscribedController.subscribe(this.handleSceneUpdate);

    // mount 後再同步一次 scene + viewport
    // 確保 mount 之後 scene 是最新的 state (避免 mount 前 controller 已經更新)
    const scene = this.props.controller.getScene();
    const viewport = this.props.controller.getViewport();
    this.setState({ scene, viewport });
  }


  // ----------------------------------------------------------
  // componentWillUnmount：元件要卸載時解除訂閱
  //
  // 為什麼一定要做？
  // - 若不 unsubscribe，controller 仍保存這個 callback reference
  // - 元件都消失了，controller 還呼叫 setState -> 會警告/記憶體洩漏
  // ----------------------------------------------------------
  componentWillUnmount() {
    // this.props.controller.unsubscribe(this.handleSceneUpdate);

    // 用當初訂閱的 controller 解除
     if (this.subscribedController) {
      this.subscribedController.unsubscribe(this.handleSceneUpdate);
      this.subscribedController = null;
     }
  }

  // ----------------------------------------------------------
  // handleSceneUpdate：controller 通知「新 (lastest) scene」時會呼叫
  //
  // - 這個 method 會 setState
  // - setState 會觸發 render
  // - render 會把新 scene 丟進 SvgSceneView 重畫
  // 
  // - scene 更新時，也同步更新 viewport
  // ----------------------------------------------------------
  private handleSceneUpdate(scene: SceneOutput) {
    // const ctrl = this.subscribedController ? this.subscribedController : this.props.controller;
    let ctrl = this.props.controller;
    if (this.subscribedController) {
      ctrl = this.subscribedController;
    }

    const viewport = ctrl.getViewport();

    // 同步 scene + viewport
    // px/py 由 slider 的 setState + controller 更新來維持一致
    this.setState({ scene, viewport });
  }

  // ----------------------------------------------------------
  // handlePointDrag：SvgSceneView 拖曳事件回報入口
  //
  // - SvgSceneView 回報的是 (id, pixel)
  // - GraphView 不解讀拖曳含義，只轉交給 controller
  // - controller 決定要怎麼處理（例如回推 a、重算 scene、通知 view）
  // ----------------------------------------------------------
  private handlePointDrag(id: string, pixel: { x: number; y: number }) {
    // Debug
    // console.log("[GraphView] onPointDrag", id, pixel);

    this.props.controller.onPointDrag(id, pixel);
  }

  // ----------------------------------------------------------
  // handleTextDrag: 方程式標籤拖曳
  // ----------------------------------------------------------
  private handleTextDrag(id: string, pixel: { x: number; y: number }) {
    this.props.controller.onTextDrag(id, pixel);
  }



  // // ----------------------------------------------------------
  // // UI：ticks 下拉選單
  // // - 只允許 ALLOWED_TICKS 內的值
  // // ----------------------------------------------------------
  // private handleOnTicksChange(e: React.ChangeEvent<HTMLSelectElement>) {
  //   const raw = Number(e.currentTarget.value);

  //   // 防呆: 確保一定是允許值
  //   let allowedTicksValue = false;
  //   let i = 0;
  //   while (i < ALLOWED_TICKS.length) {
  //     if (ALLOWED_TICKS[i] === raw) {
  //       allowedTicksValue = true;
  //     }
  //     i++;
  //   }

  //   if (allowedTicksValue) {
  //     this.setState({ ticks: raw });
  //   }
  // }

  // // ----------------------------------------------------------
  // // UI：控制刻度短線
  // // ----------------------------------------------------------
  // private handleOnShowTickLinesChange(e: React.ChangeEvent<HTMLInputElement>) {
  //   this.setState({ showTickLines: e.currentTarget.checked });
  // }

  // // ----------------------------------------------------------
  // // UI：控制刻度文字
  // // ----------------------------------------------------------
  // private handleOnShowTickLabelsChange(e: React.ChangeEvent<HTMLInputElement>) {
  //   this.setState({ showTickLabels: e.target.checked });
  // }


  // =========================================================
  // 匯出 SVG（LaTeX 可用）讓 AppView 用 ref 呼叫匯出
  //
  // 做法：
  // 1) clone 一份 svg DOM（不要直接改畫面那份）
  // 2) 加 xmlns / viewBox（讓外部工具更穩）
  // 3) 用 XMLSerializer -> Blob -> <a downSload> 下載
  // =========================================================
  public exportSvg(fileNameRaw: string) {
    // 先取得畫面上的 <svg>
    const svg = this.svgRef.current;
    if (!svg) {
      return
    }

    let fileName = fileNameRaw.trim();
    if (fileName.length === 0) {
      fileName = "figure.svg";
    }

    // 確保附檔名
    const lower = fileName.toLowerCase();
    if(!lower.endsWith(".svg")) {
      fileName = fileName + ".svg";
    }

    const svgCloned = svg.cloneNode(true) as SVGSVGElement;  // 避免直接影響原 <svg> 元素
    
    // 加上 xmlns (SVG 標準)
    //  - 有些工具看到 XML (SVG 本質上是一種 XML)，如果沒有 xmlns，可能解析會失敗
    svgCloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    // 加上 viewBox: 讓 LaText / Inkscape 縮放更穩，避免切掉、跑位
    svgCloned.setAttribute("viewBox",  `0 0 ${this.svgWidth} ${this.svgHeight}`);

    // 匯出時拿掉 border (避免文件有醜框)
    // 並且明確指定 color (因為許多 stroke 使用 currentColor)
    svgCloned.setAttribute("style", "color: black;");

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgCloned);
    const withHeader = `<?xml version="1.0" encoding="UTF-8"?>\n${source}`;

    const blob = new Blob([withHeader], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();

    // 清理 DOM 與 釋放暫時 URL (避免記憶體累積)
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

  }



  // ----------------------------------------------------------
  // render：把目前 state.scene 畫出來
  // ----------------------------------------------------------
  render() {
    // 內容區尺寸（innerW/innerH）：
    // - 用於座標軸長度、Viewport 寬高
    // - 注意：這裡 GraphView 算 innerW/innerH，Controller 也要一致
    //   否則拖曳 pixel<->econ 轉換會出現比例差
    
    // scene / viewport 都從 state 取 (確保一致)
    const scene = this.state.scene;
    const viewport = this.state.viewport;

    // // 組合 tickVisibility 傳給 AxesView
    // const tickVisibility = {
    //   showTickLines: this.state.showTickLines,
    //   showTickLabels: this.state.showTickLabels,
    // }

        
    // --------------------------------------------------------
    // 置中 offset 計算（關鍵）
    //
    // 可用內容區 = svgWidth/Height 扣掉 margin
    // plot 區大小 = viewport.getInnerWidth/Height（由 controller 算出，會隨 px/py 改）
    // offset = (avail - plot) / 2
    //
    // 這個 offset 必須同時用在：
    // - AxesView translate
    // - SvgSceneView 的 <g> translate
    // 否則軸與圖形會錯位
    // --------------------------------------------------------
    // 扣掉 margin 後，真正能畫 plot 的空間
    const innerWAvail = this.svgWidth - this.svgMargin.left - this.svgMargin.right;
    const innerHAvail = this.svgHeight - this.svgMargin.top - this.svgMargin.bottom;

    // plot 的實際尺寸由 controller 決定 (會隨 px/py 改變)
    const plotW = viewport.getInnerWidth();
    const plotH = viewport.getInnerHeight();

    let offsetX = (innerWAvail - plotW) / 2;
    let offsetY = (innerHAvail - plotH) / 2;

    // 防呆機制: 不允許 offset < 0 (理論上不會，因為 controller 已經控制 plot <= avail)
    if (offsetX < 0) {
      offsetX = 0;
    }
    if (offsetY < 0) {
      offsetY = 0;
    }

    return (
      // SVG 外框：畫布容器
      <svg
        ref={this.svgRef}
        width={this.svgWidth}
        height={this.svgHeight}
        style={{ border: "1px solid #ddd" }}
      >
        {/* ✅ 圖表標題（期刊圖常見：圖內上方置中） */}
        {/* <text
          x={this.svgWidth / 2}
          y={14}
          fontSize={14}
          textAnchor="middle"
          fill="currentColor"
        >
          {this.props.chartTitle}
        </text> */}
        {this.props.showChartTitle ? (
          <text
            x={this.svgWidth / 2}
            y={14}
            fontSize={this.props.chartTitleFontSize}
            textAnchor="middle"
            fill="currentColor"
          >
            {this.props.chartTitle}
          </text>
        ) : null}
        
        {/* AxesView 自己會 translate(margin.left, margin.top) */}
        <AxesView
          viewport={viewport}
          margin={this.svgMargin}
          offset={{ x: offsetX, y: offsetY }}
          ticks={this.props.ticks}
          tickVisibility={this.props.tickVisibility}
          xLabel={this.props.xLabel}
          yLabel={this.props.yLabel}
          showXLabel={this.props.showXLabel}
          showYLabel={this.props.showYLabel}
        />
        {/* 內容區的群組 <g>：把「畫圖原點 (0,0)」從整張 SVG 的左上角，搬到內容區的左上角 */}
        <g transform={`translate(${this.svgMargin.left + offsetX},${this.svgMargin.top + offsetY})`}>
          {/* SvgSceneView：吃 scene.drawables 畫出 budget/indiff/opt/text
              同時把拖曳事件回報給 GraphView */}
          <SvgSceneView
            scene={scene}  // Parent Component => Child Component
            onPointDrag={this.handlePointDrag}  // Child Component => Parent Component
            onTextDrag={this.handleTextDrag}
          />
        </g>
      </svg>
    );
  }
}
