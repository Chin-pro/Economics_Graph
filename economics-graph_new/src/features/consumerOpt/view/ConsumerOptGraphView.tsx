// src/mvc/view/ConsumerOptGraphView.tsx

// ------------------------------------------------------------
// ConsumerOptGraphView（View 層 / React class component）
//
// SRP：只負責
// 1) SVG 容器排版（尺寸 / margin / offset）
// 2) 訂閱 controller，接收最新 scene + viewport
// 3) 使用 rAF 合併更新（避免頻繁 setState）
// 4) 把互動事件轉交給 controller（拖曳點 / 拖曳文字）
// 5) 提供 exportSvg（匯出 SVG）
//
// 不做：
// - 經濟計算（Model / lib）
// - Scene 組裝（Controller / SceneBuilder）
// - Renderer 細節（SvgSceneView / 未來 D3/MathBox renderer）
// ------------------------------------------------------------

import React from "react";

import { AxesView } from "./AxesView";
import { SvgSceneView } from "../../../rendering/svg/SvgSceneView";

import type { SceneOutput } from "../../../core/drawables";
import { ConsumerOptController } from "../controller/ConsumerOptController";
import { Viewport } from "../../../core/viewport";

import type { TickVisibility } from "./axesTicks";

import { SVG_CANVAS_HEIGHT, SVG_CANVAS_MARGIN, SVG_CANVAS_WIDTH } from "../../../rendering/svg/layoutConfig";
import type { Margin, PlotOffset } from "../../../core/layout";

import { RafCoalescer } from "../../../rendering/raf/RafCoalescer";
import { exportSvgElement } from "../../../rendering/export/svgExport";
import { CHART_TITLE_Y, EXPORT_SVG_STYLE, SVG_BORDER_STYLE } from "./viewConstants";

// ------------------------------------------------------------
// 基本型別集中（避免到處 inline）
// ------------------------------------------------------------
type PixelPoint = { x: number; y: number };

// ------------------------------------------------------------
// Renderer（可注入）：未來換 D3 renderer / MathBox renderer 只要換這個 component
// ------------------------------------------------------------
type GraphRendererProps = {
  scene: SceneOutput;
  onPointDrag?: (id: string, pixel: PixelPoint) => void;
  onTextDrag?: (id: string, pixel: PixelPoint) => void;
};

type AxesRendererProps = {
  viewport: Viewport;
  margin: Margin;
  offset: PlotOffset;
  ticks: number;
  tickVisibility: TickVisibility;
  xLabel: string;
  yLabel: string;
  showXLabel: boolean;
  showYLabel: boolean;
};

// ------------------------------------------------------------
// Props：外部（通常 AppView）傳入 controller + UI 配置
// [CHANGED] 新增可注入 Renderer/AxesRenderer（OCP）
// ------------------------------------------------------------
type Props = {
  controller: ConsumerOptController;

  ticks: number;
  tickVisibility: TickVisibility;

  xLabel: string;
  yLabel: string;

  showXLabel: boolean;
  showYLabel: boolean;

  chartTitle: string;
  showChartTitle: boolean;
  chartTitleFontSize: number;

  // ✅ [CHANGED] 可注入 renderer，預設使用 SvgSceneView
  Renderer?: React.ComponentType<GraphRendererProps>;

  // ✅ [CHANGED] 可注入 axes renderer，預設使用 AxesView
  AxesRenderer?: React.ComponentType<AxesRendererProps>;

  // ✅ [CHANGED] 預留：多表聯動時可用 graphId 做事件路由（AE LMS）
  graphId?: string;
};

// ------------------------------------------------------------
// State：GraphView 自己持有目前 scene + viewport（視覺需要）
// ------------------------------------------------------------
type State = {
  scene: SceneOutput;
  viewport: Viewport;
};

// ------------------------------------------------------------
// 小工具：計算 plot 的置中 offset（集中管理，避免 magic）
// ------------------------------------------------------------
function computeCenterOffset(
  availW: number,
  availH: number,
  plotW: number,
  plotH: number
): PlotOffset {
  let offsetX = (availW - plotW) / 2;
  let offsetY = (availH - plotH) / 2;

  if (offsetX < 0) {
    offsetX = 0;
  }
  if (offsetY < 0) {
    offsetY = 0;
  }

  return { x: offsetX, y: offsetY };
}

// ------------------------------------------------------------
// ConsumerOptGraphView
// ------------------------------------------------------------
export class ConsumerOptGraphView extends React.Component<Props, State> {
  // ----------------------------------------------------------
  // 固定視圖配置（集中來源：rendering/svg/layoutConfig）
  // [CHANGED] svgMargin 不再在 constructor 重新賦值（避免 readonly/一致性問題）
  // ----------------------------------------------------------
  private readonly svgWidth: number;
  private readonly svgHeight: number;
  private readonly svgMargin: Margin;

  // ----------------------------------------------------------
  // controller subscription（避免 controller props 被換掉後還綁舊的）
  // ----------------------------------------------------------
  private subscribedController: ConsumerOptController | null;

  // ----------------------------------------------------------
  // svgRef：拿到 <svg> DOM 用於匯出
  // [CHANGED] 使用 RefObject<SVGSVGElement>（current 仍然可能是 null）
  // ----------------------------------------------------------
  private svgRef: React.RefObject<SVGSVGElement | null>;

  // ----------------------------------------------------------
  // rAF 合併更新器：避免多次 setState
  // ----------------------------------------------------------
  private readonly rafSceneCommitter: RafCoalescer<State>;

  public constructor(props: Props) {
    super(props);

    this.svgWidth = SVG_CANVAS_WIDTH;
    this.svgHeight = SVG_CANVAS_HEIGHT;
    this.svgMargin = SVG_CANVAS_MARGIN;

    this.svgRef = React.createRef<SVGSVGElement>();

    this.subscribedController = null;

    this.rafSceneCommitter = new RafCoalescer<State>();

    // 初始 state：拿 controller 最新 scene/viewport
    const scene = props.controller.getScene();
    const viewport = props.controller.getViewport();
    this.state = { scene, viewport };

    // bind callbacks（class component 必需）
    this.handleSceneUpdate = this.handleSceneUpdate.bind(this);
    this.handlePointDrag = this.handlePointDrag.bind(this);
    this.handleTextDrag = this.handleTextDrag.bind(this);
  }

  // ----------------------------------------------------------
  // componentDidMount
  // Input: none
  // Output: void
  // 設計目的：
  // - 訂閱 controller
  // - mount 後再同步一次（避免 mount 前 controller 已更新）
  // ----------------------------------------------------------
  public componentDidMount(): void {
    this.attachToController(this.props.controller);

    const scene = this.props.controller.getScene();
    const viewport = this.props.controller.getViewport();
    this.setState({ scene, viewport });
  }

  // ----------------------------------------------------------
  // componentDidUpdate
  // Input:
  // - prevProps: Props
  // - prevState: State
  // Output: void
  // 設計目的：
  // - 若外部把 controller 換掉（未來多模型、多圖表很常見）
  //   要解除舊訂閱、改訂閱新 controller，避免 memory leak / 亂更新
  // ----------------------------------------------------------
  public componentDidUpdate(prevProps: Props): void {
    if (prevProps.controller !== this.props.controller) {
      this.detachFromController();
      this.attachToController(this.props.controller);

      const scene = this.props.controller.getScene();
      const viewport = this.props.controller.getViewport();
      this.setState({ scene, viewport });
    }
  }

  // ----------------------------------------------------------
  // componentWillUnmount
  // Input: none
  // Output: void
  // 設計目的：
  // - 解除訂閱
  // - 取消 rAF，避免元件卸載後仍 commit setState（記憶體洩漏）
  // ----------------------------------------------------------
  public componentWillUnmount(): void {
    this.detachFromController();
    this.rafSceneCommitter.cancel();
  }

  // ----------------------------------------------------------
  // attachToController
  // Input: controller: ConsumerOptController
  // Output: void
  // 設計目的：
  // - 集中管理 subscribe 行為，避免到處散落
  // ----------------------------------------------------------
  private attachToController(controller: ConsumerOptController): void {
    this.subscribedController = controller;
    controller.subscribe(this.handleSceneUpdate);
  }

  // ----------------------------------------------------------
  // detachFromController
  // Input: none
  // Output: void
  // 設計目的：
  // - 集中管理 unsubscribe 行為
  // ----------------------------------------------------------
  private detachFromController(): void {
    if (this.subscribedController) {
      this.subscribedController.unsubscribe(this.handleSceneUpdate);
      this.subscribedController = null;
    }
  }

  // ----------------------------------------------------------
  // handleSceneUpdate（controller 通知更新）
  // Input:
  // - scene: SceneOutput（最新場景）
  // Output: void
  //
  // 設計目的：
  // - 取得同一時間點的 viewport
  // - 用 rAF 合併 setState（同一 frame 只更新一次）
  // - 避免 UI 更新過密造成卡頓
  // ----------------------------------------------------------
  private handleSceneUpdate(scene: SceneOutput): void {
    const ctrl = this.subscribedController ? this.subscribedController : this.props.controller;
    const viewport = ctrl.getViewport();

    // ✅ [CHANGED] rAF coalesce，避免頻繁 setState
    this.rafSceneCommitter.request({ scene, viewport }, (next) => {
      this.setState(next);
    });
  }

  // ----------------------------------------------------------
  // handlePointDrag（互動事件轉交）
  // Input:
  // - id: string（drawable id）
  // - pixel: PixelPoint（局部像素座標）
  // Output: void
  // 設計目的：
  // - View 不解讀含義，交給 controller 做 econ/pixel mapping
  // ----------------------------------------------------------
  private handlePointDrag(id: string, pixel: PixelPoint): void {
    this.props.controller.onPointDrag(id, pixel);
  }

  // ----------------------------------------------------------
  // handleTextDrag（互動事件轉交）
  // Input:
  // - id: string（text drawable id）
  // - pixel: PixelPoint（局部像素座標）
  // Output: void
  // ----------------------------------------------------------
  private handleTextDrag(id: string, pixel: PixelPoint): void {
    this.props.controller.onTextDrag(id, pixel);
  }

  // ----------------------------------------------------------
  // exportSvg（提供給外部 AppView 呼叫）
  // Input:
  // - fileNameRaw: string
  // Output: void
  //
  // 設計目的：
  // - GraphView 只負責「觸發」，實作細節放在 svgExport.ts（SRP）
  // - clone 匯出，避免汙染畫面 DOM（避免 cache 污染）
  // ----------------------------------------------------------
  public exportSvg(fileNameRaw: string): void {
    const svg = this.svgRef.current;
    if (!svg) {
      return;
    }

    exportSvgElement(svg, {
      fileNameRaw,
      width: this.svgWidth,
      height: this.svgHeight,
      exportStyle: EXPORT_SVG_STYLE,
    });
  }

  // ----------------------------------------------------------
  // render
  // Input: none
  // Output: React.ReactNode
  // 設計目的：
  // - 計算 offset，讓 plot 在可用區域置中
  // - 呼叫 AxesRenderer + Renderer（預設 AxesView + SvgSceneView）
  // ----------------------------------------------------------
  public render(): React.ReactNode {
    const scene = this.state.scene;
    const viewport = this.state.viewport;

    const innerWAvail = this.svgWidth - this.svgMargin.left - this.svgMargin.right;
    const innerHAvail = this.svgHeight - this.svgMargin.top - this.svgMargin.bottom;

    const plotW = viewport.getInnerWidth();
    const plotH = viewport.getInnerHeight();

    const offset = computeCenterOffset(innerWAvail, innerHAvail, plotW, plotH);

    // ✅ [CHANGED] Renderer / AxesRenderer 可注入（OCP）
    const Renderer = this.props.Renderer ? this.props.Renderer : SvgSceneView;
    const AxesRenderer = this.props.AxesRenderer ? this.props.AxesRenderer : AxesView;

    // ✅ [CHANGED] 不用 ternary，改用條件式建 node
    let titleNode: React.ReactNode = null;
    if (this.props.showChartTitle) {
      titleNode = (
        <text
          x={this.svgWidth / 2}
          y={CHART_TITLE_Y}
          fontSize={this.props.chartTitleFontSize}
          textAnchor="middle"
          fill="currentColor"
        >
          {this.props.chartTitle}
        </text>
      );
    }

    return (
      <svg
        ref={this.svgRef}
        width={this.svgWidth}
        height={this.svgHeight}
        style={SVG_BORDER_STYLE}
      >
        {titleNode}

        <AxesRenderer
          viewport={viewport}
          margin={this.svgMargin}
          offset={offset}
          ticks={this.props.ticks}
          tickVisibility={this.props.tickVisibility}
          xLabel={this.props.xLabel}
          yLabel={this.props.yLabel}
          showXLabel={this.props.showXLabel}
          showYLabel={this.props.showYLabel}
        />

        <g transform={`translate(${this.svgMargin.left + offset.x},${this.svgMargin.top + offset.y})`}>
          <Renderer
            scene={scene}
            onPointDrag={this.handlePointDrag}
            onTextDrag={this.handleTextDrag}
          />
        </g>
      </svg>
    );
  }
}
