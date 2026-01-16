// src/app/AppView.tsx

// ------------------------------------------------------------
// AppView：你的「應用程式最上層 View」(React class component)
// (1) 建立 Model：new ConsumerOptModel(...)
// (2) 建立 Controller：new ConsumerOptController(...)
// (3) 建立 GraphView：負責畫圖（訂閱 controller）
// (4) 建立 ControlsPanel：負責 UI 控制（slider/checkbox/...）
// (5) 管理「UI state ↔ model/controller」的同步：
//     - slider 改變：AppView 更新 UI state + 呼叫 controller 更新 model
//     - 拖曳點改變：controller 更新 model 後 notify，AppView 再把 model 同步回 UI state
//
// - AppView 是「Composition Root」：負責把 MVC 物件組起來
// - 它本身仍是 View，但也是 "wiring" 的地方
//
// 重要更新（React 18 / StrictMode 常見坑）
// - subscribe 這種「副作用」不要放在 constructor
// - 要放在 componentDidMount（確保元件真的 mounted 後才訂閱）
// - 卸載時在 componentWillUnmount 取消訂閱
// ------------------------------------------------------------

import React from "react";

// Model：保存參數 + 提供 econ compute
import { ConsumerOptModel, type ConsumerParams } from "../MVC/model/ConsumerOptModel";

// Controller：接 UI 事件、更新 model、build scene、notify listeners
import { ConsumerOptController } from "../MVC/controller/ConsumerOptController";

// GraphView：SVG 容器 + 訂閱 controller 更新 + renderer (SvgSceneView)
import { ConsumerOptGraphView } from "../MVC/view/ConsumerOptGraphView";

// ticks 的顯示選項型別（GraphView 用）
import type { TickVisibility } from "../MVC/view/axesTicks";

// Layout: 統一計算 innerWidth / innerHeight (避免 hard-code)
import { computeInnerAvailSize } from "../core/layout";

// SceneOutput: listener 型別需要 (scene: SceneOutput) => void
import type { SceneOutput } from "../core/drawables";

// ------------------------------------------------------------
//  引入「純 UI 控制面板」ConsumerOptControlsPanel
//  - 已經將 ControlsPanel 抽離成獨立檔案 (SRP)
//  - AppView 應該只做 wiring，不應該把整個 UI 都塞在 render 裡
// ------------------------------------------------------------
import {
    ConsumerOptControlsPanel,
    type ControlsState,  // 直接重用 ControlsPanel 定義的巢狀 state
} from "./ConsumerOptControlsPanel";

// ------------------------------------------------------------
// ALLOWED_TICKS: 限制 ticks 值: 避免奇怪數字 (1, 2, 4, 5, 10)
// ------------------------------------------------------------
import { ALLOWED_TICKS } from "./ControlPanel/constants";


// ------------------------------------------------------------
// AppView 的 state：
// - I：收入 slider 顯示用（UI state）
// - a：alpha slider 顯示用（UI state）
//
// 注意：Model 內也有一份 I/a（Model state）
// - slider 改變：AppView setState + controller 更新 model
// - 拖曳點改變：controller 更新 model，並 notify，AppView 再 setState 同步 slider
// ------------------------------------------------------------
// type State = {
//     // 模型相關 (UI 顯示用)
//     I: number;
//     exponent: number;
//     px: number;
//     py: number;

//     // 圖表控制 (純 UI)
//     ticks: number;
//     showTickLines: boolean;
//     showTickLabels: boolean;

//     // 軸標籤 (變數名稱)
//     xLabel: string;
//     yLabel: string;

//     // 圖表標題 (會出現在 SVG 內)
//     chartTitle: string;

//     // 匯出檔名
//     exportFileName: string;

//     // 線段顏色 (線段 + 方程式標籤共用)
//     budgetColor: string;
//     indiffColor: string;

//     showEquationLabels: boolean;
//     equationFontSize: number;

//     showOpt: boolean;
//     optPointColor: string;
//     optTextColor: string;

//     showXLabel: boolean;
//     showYLabel: boolean;

//     showChartTitle: boolean;
//     chartTitleFontSize: number;
// };
type State = ControlsState;


// ------------------------------------------------------------
// React.Component<Props, State> 
//   => P : props 的型別；S : state 的型別
// 你的 props 不需要任何東西，所以用 Record<string, never>
// （代表：不允許有任何 props key）
// ------------------------------------------------------------
export default class AppView extends React.Component<
    Record<string, never>,  // props 型別
    State                   // state 型別
> {
    // ----------------------------------------------------------
    // controller / model：用 class fields 保存（不放在 state）
    //
    // - 這些是「長壽命物件」，不需要因為它們改變就 re-render
    // - state 只放 UI 需要觸發 render 的資料（I,a）
    // ----------------------------------------------------------
    private controller: ConsumerOptController;
    private model: ConsumerOptModel;
    

    // 用 ref 拿到 GraphView，才能從左側按鈕呼叫 exportSvg
    private graphRef: React.RefObject<ConsumerOptGraphView | null>;

    // ----------------------------------------------------------
    // constructor：初始化 UI state、建立 MVC 物件、綁定事件、建立同步訂閱
    // ----------------------------------------------------------
    constructor(props: Record<string, never>) {  // 組件傳入參數 props
        super(props);

        // 1) 初始化參數
        const initialParameters: ConsumerParams = { I: 20, exponent: 0.5, px: 1, py: 1}

        // // 2) 初始化 UI state（slider 顯示用）
        // this.state = { 
        //     I: initialParameters.I, 
        //     exponent: initialParameters.exponent,
        //     px: initialParameters.px,
        //     py: initialParameters.py,

        //     ticks: 5,
        //     showTickLines: true,
        //     showTickLabels: true,

        //     xLabel: "x",
        //     yLabel: "y",

        //     chartTitle: "Consumer Optimum (Cobb-Douglas)",
        //     exportFileName: "figure-consumer-opt.svg",

        //     budgetColor: "#111111",
        //     indiffColor: "#111111",


        //     showEquationLabels: true,
        //     equationFontSize: 12,

        //     showOpt: true,
        //     optPointColor: "#111111",
        //     optTextColor: "#111111",

        //     showXLabel: true,
        //     showYLabel: true,

        //     showChartTitle: true,
        //     chartTitleFontSize: 14,
        // };
        

        // 3) 建立 Model：把初始參數塞進去
        //    注意：Model 內部自己保存一份 params
        this.model = new ConsumerOptModel(initialParameters);


        // 4) 建立 Controller (協調 model、產 scene、通知 view)
        //    Controller 需要 innerW/innerH（內容區大小），以及 model
        //
        //    你這裡寫：
        //      innerW: 520 - 40 - 20
        //      innerH: 360 - 20 - 30
        //    其實就是：
        //      W=520, H=360
        //      margin = {left:40, right:20, top:20, bottom:30}
        //
        //    ⚠️ 風險：GraphView 裡如果 margin 或 W/H 改了，
        //      但 AppView 沒改，controller 的 innerW/innerH 就會跟 View 不一致，
        //      拖曳的 pixel<->econ 會比例錯。
        //
        //    更乾淨做法：由 GraphView/或一個共用 LayoutConfig 統一產生 innerW/innerH。
        // TODO: 建議抽到共用 LayoutConfig，避免 GraphView 改 margin/W/H 時不一致
        // 改由 layout 統計計算 innerWidth/innerHeight，避免 hard code
        const inner = computeInnerAvailSize();

        this.controller = new ConsumerOptController({
            innerAvailWidth: inner.innerWidth,
            innerAvailHeight: inner.innerHeight,
            model: this.model,
        });

        // X) 建立 ref
        this.graphRef = React.createRef<ConsumerOptGraphView>();

        // --------------------------------------------------------
        // X) 初始化 UI state（完全用 ControlsState 結構）
        //
        // [CHANGED] 你的 controlsPanelTypes 是巢狀 state：
        // - axis / title / tick / export / viewOptions / model
        // --------------------------------------------------------
        this.state = {
            // ------------------------------------------------------
            // axis group：X/Y 軸變數名稱 + 是否顯示
            // ------------------------------------------------------
            axis: {
                xLabel: "x",
                yLabel: "y",
                showXLabel: true,
                showYLabel: true,
            },

            // ------------------------------------------------------
            // title group：圖表標題
            // ------------------------------------------------------
            title: {
                chartTitle: "Consumer Optimum (Cobb-Douglas)",
                showChartTitle: true,
                chartTitleFontSize: 14,
            },

            // ------------------------------------------------------
            // tick group：ticks + visibility
            // ------------------------------------------------------
            tick: {
                ticks: 5,
                showTickLines: true,
                showTickLabels: true,
            },

            // ------------------------------------------------------
            // export group：匯出檔名
            // ------------------------------------------------------
            export: {
                exportFileName: "figure-consumer-opt.svg",
            },

            // ------------------------------------------------------
            // viewOptions：要同步進 controller 的「渲染選項」
            // 注意：這些會影響 scene drawables
            // ------------------------------------------------------
            viewOptions: {
                showEquationLabels: true,
                labelFontSize: 12,

                showOpt: true,
                optPointColor: "#111111",
                optTextColor: "#111111",

                budgetColor: "#111111",
                indiffColor: "#111111",
            },

            // ------------------------------------------------------
            // model group：UI 顯示用（實際 single source 在 this.model）
            // AppView 會把 slider 的值「寫進 controller」，再由 controller 更新 model
            // ------------------------------------------------------
            model: {
                I: initialParameters.I,
                exponent: initialParameters.exponent,
                px: initialParameters.px,
                py: initialParameters.py,
            },
        };



        // 5) bind：class component 綁定 this
        //    因為下面會把 handler 當 callback 傳給 onChange / subscribe
        //    當 callback 傳遞時才不會 this=undefined
        // this.handleParamsFromController = this.handleParamsFromController.bind(this);

        // // this.handleIncomeChange = this.handleIncomeChange.bind(this);
        // // this.handleAlphaChange = this.handleAlphaChange.bind(this);
        
        // // this.handlePxChange = this.handlePxChange.bind(this);
        // // this.handlePyChange = this.handlePyChange.bind(this);

        // // this.handleModelSyncFromController = this.handleModelSyncFromController.bind(this);

        // this.handleExportClick = this.handleExportClick.bind(this);

        // // // ??? 你也可以保留 handleIncomeChange/handleAlphaChange，但這裡直接用 slider onChange inline 即可

        // // this.controller.setShowEquationLabels(this.state.showEquationLabels);
        // // this.controller.setEquationFontSize(this.state.equationFontSize);
        // // this.controller.setShowOpt(this.state.showOpt);
        // // this.controller.setOptPointColor(this.state.optPointColor);
        // // this.controller.setOptTextColor(this.state.optTextColor);

        // --------------------------------------------------------
        // bind handlers（class component 必備）
        // --------------------------------------------------------
        this.handleSceneUpdateFromController = this.handleSceneUpdateFromController.bind(this);
        this.handleExportClick = this.handleExportClick.bind(this);

        this.handleControlsStatePatch = this.handleControlsStatePatch.bind(this);
        this.handleViewOptionsPatch = this.handleViewOptionsPatch.bind(this);

        this.handleChangeTicks = this.handleChangeTicks.bind(this);

        this.handleIncomeChange = this.handleIncomeChange.bind(this);
        this.handleAlphaChange = this.handleAlphaChange.bind(this);
        this.handlePxChange = this.handlePxChange.bind(this);
        this.handlePyChange = this.handlePyChange.bind(this);
    }

    // ----------------------------------------------------------
    // componentDidMount：(mounted 後才訂閱)
    // 安全：確保組件真的出現在畫面上，避免組件尚未掛載即渲染
    // this.setState({ I:p.I, a:p.a })：確保訂閱開始後，UI state 立刻跟
    // model state 對齊，避免極端時序下不同步
    // ----------------------------------------------------------
    componentDidMount(){
        // this.controller.subscribe(this.handleParamsFromController);

        // // 確保 mounted 後 UI state 跟 model params 完全一致
        // const params = this.model.getModelParams();
        // this.setState({ I: params.I, exponent: params.exponent, px: params.px, py: params.py });

        // // 把 viewOption 同步進 controller (單一入口，避免散落 setXXX)
        // this.controller.setViewOptions(this.state.viewOption)
            // 訂閱 scene 更新（AppView 用來同步 model -> UI slider）
        this.controller.subscribe(this.handleSceneUpdateFromController);

        // mount 後：把 UI 的 viewOptions 整包同步進 controller
        //（避免 controller 內建預設與 UI state 不一致）
        this.controller.setViewOptions(this.state.viewOptions);

        // mount 後：再用 model 當下值回寫 UI（保險）
        const p = this.model.getModelParams();
        this.setState({
            model: {
                ...this.state.model,
                I: p.I,
                exponent: p.exponent,
                px: p.px,
                py: p.py,
            },
        });
    }


    // ----------------------------------------------------------
    // componentWillUnmount：元件卸載時解除訂閱 (卸載前取消訂閱)
    // 避免 controller 還在 notify 時呼叫 setState，造成 memory leak 警告
    // ----------------------------------------------------------
    componentWillUnmount() {
        // this.controller.unsubscribe(this.handleParamsFromController);
        this.controller.unsubscribe(this.handleSceneUpdateFromController)
    }

    // // ----------------------------------------------------------
    // // handleModelSyncFromController：
    // // controller notify 時，同步 model -> UI (slider)
    // // ----------------------------------------------------------
    // private handleModelSyncFromController() {
    //   const params = this.model.getModelParams();
    //   this.setState({ I: params.I, a: params.a, px: params.px, py: params.py });
    // }

    
    // ----------------------------------------------------------
    //  handleSceneUpdateFromController
    //
    //  Input:
    //  - scene: SceneOutput（這裡不一定要用，但 listener 型別需要）
    //
    //  Output:
    //  - void：同步 model params 回 UI state（slider 顯示）
    // ----------------------------------------------------------
    private handleSceneUpdateFromController(_scene: SceneOutput) {
        // 從 single source of truth（Model）讀取最新參數
        const p = this.model.getModelParams();

        const model = {
                ...this.state.model,
                I: p.I,
                exponent: p.exponent,
                px: p.px,
                py: p.py,
            };

        // 只更新 model group，其他 UI 不動
        this.setState({ model });
    }
    
    // // ----------------------------------------------------------
    // // handleParamsFromController：
    // // 當 controller 通知「scene 更新」時，AppView 讀取 model params，
    // // 把最新的 I/a/px/py 同步回 UI state。
    // //
    // // 這個設計的本質：你把「單一真實來源」放在 Model，
    // // AppView 只是把 Model 的值映射到 UI（slider）。
    // // ----------------------------------------------------------
    // private handleParamsFromController() {
    //     const params = this.model.getModelParams();
    //     this.setState({ I: params.I, exponent: params.exponent, px: params.px, py: params.py });
    // }


    // ----------------------------------------------------------
    // handleExportClick：
    //
    // ----------------------------------------------------------
    private handleExportClick() {
        const graphRefClick = this.graphRef.current;
        if (!graphRefClick) {
            return;
        }

        const fileName = this.state.export.exportFileName;
        graphRefClick.exportSvg(fileName);
    }

    // ==========================================================
    // ControlsPanel -> AppView：狀態更新（巢狀 patch）
    // ==========================================================
    
    // ----------------------------------------------------------
    // handleControlsStatePatch
    // - ConsumerOptControlsPanel 會丟部分 patch 進來
    // - 要在 AppView 做 merge（immutable）
    // ----------------------------------------------------------
    private handleControlsStatePatch(patch: Partial<ControlsState>) {
        // 注意：patch 可能只包含 axis/title/tick/export 的其中之一
        // 這裡做「一層 merge」
        this.setState({
            ...this.state,
            ...patch,
        });
    }

    // ----------------------------------------------------------
    // handleViewOptionsPatch
    // - viewOptions 統一入口

    // Input:
    // - patch: Partial<ConsumerViewOptions>
    //
    // Output:
    // - void：更新 UI state.viewOptions + 呼叫 controller.setViewOptions(patch)
    //
    // ----------------------------------------------------------
    private handleViewOptionsPatch(patch: Partial<State["viewOptions"]>) {
        // 1) 先更新 UI state（讓 ControlsPanel 顯示一致）
        this.setState({
        viewOptions: {
            ...this.state.viewOptions,
            ...patch,
        },
        });

        // 2) 再把 patch 丟給 controller（由 controller 決定 light rebuild）
        this.controller.setViewOptions(patch);
    }



    // // ----------------------------------------------------------
    // // handleAlphaFromController：
    // // 當 controller 通知「scene 更新」時，AppView 讀取 model params，
    // // 把最新的 a / I 同步回 UI state。
    // //
    // // 這個設計的本質：你把「單一真實來源」放在 Model，
    // // AppView 只是把 Model 的值映射到 UI（slider）。
    // //
    // // ⚠️ 注意：你這裡同步 I 其實也合理，
    // // 因為 controller 也可能更新 I（例如未來你允許拖曳預算線端點）
    // // ----------------------------------------------------------
    // private handleAlphaFromController() {
    //   const p = this.model.getModelParams();
    //   this.setState({ a: p.a, I: p.I });
    // }

    // ==========================================================
    // ControlsPanel -> AppView：模型 sliders
    // ==========================================================
    // ----------------------------------------------------------
    // handleIncomeChange
    // - UI state 先改（滑桿受控）
    // - 再通知 controller 更新 model（heavy rebuild）
    // ----------------------------------------------------------
    private handleIncomeChange(nextI: number) {
        this.setState({
            model: {
                ...this.state.model,
                I: nextI,
            },
        });

        this.controller.onIncomeChange(nextI);
    }

    // ----------------------------------------------------------
    // handleAlphaChange（你的 exponent 實際上是 alpha）
    // ----------------------------------------------------------
    private handleAlphaChange(nextAlpha: number) {
        this.setState({
            model: {
                ...this.state.model,
                exponent: nextAlpha,
            },
        });

        this.controller.onAlphaChange(nextAlpha);
    }

    // ----------------------------------------------------------
    // handlePxChange
    // ----------------------------------------------------------
    private handlePxChange(nextPx: number) {
        this.setState({
            model: {
                ...this.state.model,
                px: nextPx,
            },
        });

        this.controller.onPxChange(nextPx);
    }

    // ----------------------------------------------------------
    // handlePyChange
    // ----------------------------------------------------------
    private handlePyChange(nextPy: number) {
        this.setState({
            model: {
                ...this.state.model,
                py: nextPy,
            },
        });

        this.controller.onPyChange(nextPy);
    }

    // ==========================================================
    // ControlsPanel -> AppView：ticks 更新（上層規則）
    // ==========================================================

    // ----------------------------------------------------------
    // handleChangeTicks
    // - 控制 ticks 必須在 ALLOWED_TICKS 內
    // - AppView 是規則擁有者（ControlsPanel 只是 UI）
    // ----------------------------------------------------------
    private handleChangeTicks(nextTicks: number) {
        // 防呆：只接受 ALLOWED_TICKS
        let ok = false;
        let i = 0;
        while (i < ALLOWED_TICKS.length) {
            if (ALLOWED_TICKS[i] === nextTicks) {
                ok = true;
            }
            i += 1;
        }

        if (!ok) {
            return;
        }

        this.setState({
            tick: {
                ...this.state.tick,
                ticks: nextTicks,
            },
        });
    }


    // ----------------------------------------------------------
    // render：渲染 UI
    // - 左側：slider 控制
    // - 右側：ConsumerOptGraphView（圖）
    //
    // 你目前 px/py 固定成 1，只顯示出來，不提供 slider
    // ----------------------------------------------------------
    render() {
        const tickVisibility: TickVisibility = {  
            showTickLines: this.state.tick.showTickLines,
            showTickLabels: this.state.tick.showTickLabels,
        };

        // 左側 controls panel
        const controlsPanel = (
            <ConsumerOptControlsPanel
                state={this.state}
                onChangeState={this.handleControlsStatePatch}
                onViewOptionsChange={this.handleViewOptionsPatch}
                onChangeTicks={this.handleChangeTicks}
                onExportClick={this.handleExportClick}
                onIncomeChange={this.handleIncomeChange}
                onAlphaChange={this.handleAlphaChange}
                onPxChange={this.handlePxChange}
                onPyChange={this.handlePyChange}
            />
        );

        // 右側 graph
        const graphPanel = (
            <ConsumerOptGraphView
                ref={this.graphRef}
                controller={this.controller}
                ticks={this.state.tick.ticks}
                tickVisibility={tickVisibility}
                xLabel={this.state.axis.xLabel}
                yLabel={this.state.axis.yLabel}
                showXLabel={this.state.axis.showXLabel}
                showYLabel={this.state.axis.showYLabel}
                chartTitle={this.state.title.chartTitle}
                showChartTitle={this.state.title.showChartTitle}
                chartTitleFontSize={this.state.title.chartTitleFontSize}
            />
        );

        return (
            <div style={{ padding: 16 }}>
                <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                    {controlsPanel}
                    {graphPanel}
                </div>
            </div>
        );
    }
}
