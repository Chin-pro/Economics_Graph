// src/app/AppView.tsx

// ------------------------------------------------------------
//  App (App Shell / Composition Root)
//  SRP:
//  - AppView 只負責「App層」的事情:
//    1) 選擇哪個 feature: 決定目前 active featureId (未來可做下拉選單 / route / URL)
//    2) 從 registry 取得 FeatureModule
//    3) 建立 controller (once)
//    2) 把 feature 掛載到畫面: 把 featureId 交給 FeatureHost 掛載，由 feature 組裝 UI
//
//  AppView 不再負責:
//  - import ConsumerOptGraphView / ConsumerOptControlsPanel
//  - new ConsumerOptController / ConsumerOptModel
//  - 管理 consumerOpt 的 UI state (轉移到 feature 的 Root)
//
//  OCP (對擴充開放、對修改封閉):
//  - 新增新 feature (供需、賽局、GE)時，不用一直修改 AppView
//  - UI 重作 (Figma Make)時，AppView 幾乎不用動
// ------------------------------------------------------------

import React from "react";

// FeatureRegistry: AppView 不再直接 new controller，而是透過 module 直接建立 (取代 new controller)
import type { FeatureId } from "../features/types";

// App 層的預設 feature 選擇，features/registry 提供「產品決策」
import { DEFAULT_FEATURE_ID } from "../features/registry";

// Feature 掛載器: App 將選取的 featureID 傳遞給 FeatureHost，由 FeatureHost 進行「找到 module/建立 controller/mount root UI」
import { FeatureHost } from "./FeatureHost";

// ------------------------------------------------------------
// AppView 的 state：
// ------------------------------------------------------------
// type State = ControlsState;
type State = {
    activeFeatureId: FeatureId;
}

// ------------------------------------------------------------
//  AppView
//  - React.Component<Props, State> 
//    - P : props 的型別；S : state 的型別
//  - props 不需要任何東西，所以用 Record<string, never>
//   （代表：不允許有任何 props key）
//    - 這麼設計可以擋掉所又 props 傳遞到 App 層，因為 AppView 是 app shell，
//      不應該依賴外部 props，違反 SRP
//
//  Input:
//  - props: void (Record<string, never>)
//
//  Output:
//  - ReactElement: App Shell (目前只掛載 FeatureHost)
// ------------------------------------------------------------
export default class AppView extends React.Component<
    Record<string, never>, 
    State
> {
    // ----------------------------------------------------------
    //  constructor
    //  
    //  Input: (隱含 input)
    //  - this.state.activeFeatureId
    //
    //  Output: React.ReactNode
    // ----------------------------------------------------------
    public constructor(props: Record<string, never>) {
        super(props);

        this.state = {
            activeFeatureId: DEFAULT_FEATURE_ID,
        };
    }
    // AppView 僅做到這一步，選取 activeFeatureId，並且傳遞下去
    public render(): React.ReactNode {
        return (
            <div style={{ padding: 16 }}>
                <FeatureHost featureId={this.state.activeFeatureId} />
            </div>
        );
    }
}

// export default class AppView extends React.Component<
//     Record<string, never>,  // props 型別
//     State                   // state 型別
// > {
//     // ----------------------------------------------------------
//     // controller / model：用 class fields 保存（不放在 state）
//     //
//     // - 這些是「長壽命物件」，不需要因為它們改變就 re-render
//     // - state 只放 UI 需要觸發 render 的資料（I,a）
//     // ----------------------------------------------------------
//     // private model: ConsumerOptModel;
//     // [CHANGED] [Step2] 目前選擇的 feature (未來進行 feature switch 的更新)
//     private activeFeatureId: FeatureId;

//     // controller: 由 FeatureModule 建立
//     private controller: ConsumerOptController;
    

//     // 用 ref 拿到 GraphView，才能從左側按鈕呼叫 exportSvg
//     private graphRef: React.RefObject<ConsumerOptGraphView | null>;

//     // ----------------------------------------------------------
//     // constructor：初始化 UI state、建立 MVC 物件、綁定事件、建立同步訂閱
//     // ----------------------------------------------------------
//     constructor(props: Record<string, never>) {  // 組件傳入參數 props
//         super(props);

//         // 1) 初始化參數（集中在 controlPanel/defaults.ts）
//         const initialParameters = DEFAULT_CONSUMER_PARAMS;

//         // // 2) 初始化 UI state（slider 顯示用）
//         // this.state = { 
//         //     I: initialParameters.I, 
//         //     exponent: initialParameters.exponent,
//         //     px: initialParameters.px,
//         //     py: initialParameters.py,

//         //     ticks: 5,
//         //     showTickLines: true,
//         //     showTickLabels: true,

//         //     xLabel: "x",
//         //     yLabel: "y",

//         //     chartTitle: "Consumer Optimum (Cobb-Douglas)",
//         //     exportFileName: "figure-consumer-opt.svg",

//         //     budgetColor: "#111111",
//         //     indiffColor: "#111111",


//         //     showEquationLabels: true,
//         //     equationFontSize: 12,

//         //     showOpt: true,
//         //     optPointColor: "#111111",
//         //     optTextColor: "#111111",

//         //     showXLabel: true,
//         //     showYLabel: true,

//         //     showChartTitle: true,
//         //     chartTitleFontSize: 14,
//         // };
        

//         // // 3) 建立 Model：把初始參數塞進去
//         // //    注意：Model 內部自己保存一份 params
//         // this.model = new ConsumerOptModel(initialParameters);

//         // [CHANGED] [Step 2]
//         // 3) AppView 不再直接 new ConsumerOptModel / ConsumerOptController
//         //    改為:
//         //    - 從 FeatureRegistry 取得 module
//         //    - 由 module.createController(...) 統一建構 controller (內部包含 model 的建立)
//         //
//         //    - 未來 AppView 不需要知道「controller 如何初始化 model」
//         //    - 未來新增供需 / 賽局 / General Equilibrium，只需要註冊 module + 做 feature switch 即可
//         this.activeFeatureId = DEFAULT_FEATURE_ID;

//         const module = getFeatureModule(this.activeFeatureId);


//         // 4) 建立 Controller (協調 model、產 scene、通知 view)
//         //    Controller 需要 innerW/innerH（內容區大小），以及 model
//         //
//         //    你這裡寫：
//         //      innerW: 520 - 40 - 20
//         //      innerH: 360 - 20 - 30
//         //    其實就是：
//         //      W=520, H=360
//         //      margin = {left:40, right:20, top:20, bottom:30}
//         //
//         //    ⚠️ 風險：GraphView 裡如果 margin 或 W/H 改了，
//         //      但 AppView 沒改，controller 的 innerW/innerH 就會跟 View 不一致，
//         //      拖曳的 pixel<->econ 會比例錯。
//         //
//         //    更乾淨做法：由 GraphView/或一個共用 LayoutConfig 統一產生 innerW/innerH。
//         // TODO (Step3/2.5):
//         // 目前 layoutConfig 是固定 outer size -> inner size
//         // 未來改成 GraphHost 量測容器尺寸（ResizeObserver）後，
//         // 透過 controller.dispatch({type:"RESIZE", ...}) 走 LIGHT 更新 viewport
//         const inner = computeSvgInnerAvailSize();

//         // this.controller = new ConsumerOptController({
//         //     innerAvailWidth: inner.innerWidth,
//         //     innerAvailHeight: inner.innerHeight,
//         //     model: this.model,
//         // });

//         // [CHANGED] [Step 2]
//         // module.createController 回傳 FeatureController；目前 AppView 仍使用 ConsumerOptGraphView，
//         // 因此這裡先以 ConsumerOptController 來使用 (之後 Step 2.5/Step 3 可再把 View / Host 泛化)
//         const created = module.createController({
//             innerAvailWidth: inner.innerWidth,
//             innerAvailHeight: inner.innerHeight,
//         });

//         this.controller = created as ConsumerOptController;


//         // X) 建立 ref
//         this.graphRef = React.createRef<ConsumerOptGraphView>();

//         // --------------------------------------------------------
//         // X) 初始化 UI state（完全用 ControlsState 結構）
//         //
//         // SRP：AppView 只負責 wiring，不應該塞大量預設值細節。
//         // 預設值集中在 createDefaultControlsState()。
//         // --------------------------------------------------------
//         this.state = createDefaultControlsState(initialParameters);



//         // 5) bind：class component 綁定 this
//         this.handleSceneUpdateFromController = this.handleSceneUpdateFromController.bind(this);
//         this.handleExportClick = this.handleExportClick.bind(this);

//         this.handleControlsStatePatch = this.handleControlsStatePatch.bind(this);
//         this.handleViewOptionsPatch = this.handleViewOptionsPatch.bind(this);

//         this.handleChangeTicks = this.handleChangeTicks.bind(this);

//         this.handleIncomeChange = this.handleIncomeChange.bind(this);
//         this.handleAlphaChange = this.handleAlphaChange.bind(this);
//         this.handlePxChange = this.handlePxChange.bind(this);
//         this.handlePyChange = this.handlePyChange.bind(this);
//     }

//     // ----------------------------------------------------------
//     // componentDidMount：(mounted 後才訂閱)
//     // 安全：確保組件真的出現在畫面上，避免組件尚未掛載即渲染
//     // this.setState({ I:p.I, a:p.a })：確保訂閱開始後，UI state 立刻跟
//     // model state 對齊，避免極端時序下不同步
//     // ----------------------------------------------------------
//     componentDidMount(){
//         // // 把 viewOption 同步進 controller (單一入口，避免散落 setXXX)
//         // this.controller.setViewOptions(this.state.viewOption)
//             // 訂閱 scene 更新（AppView 用來同步 model -> UI slider）
//         this.controller.subscribe(this.handleSceneUpdateFromController);

//         // mount 後：把 UI 的 viewOptions 整包同步進 controller
//         //（避免 controller 內建預設與 UI state 不一致）
//         this.controller.setViewOptions(this.state.viewOptions);

//         // // mount 後：再用 model 當下值回寫 UI（保險）
//         // const p = this.model.getModelParams();

//         // mount 後：再用「controller 快照」回寫 UI（保險）
//         const p = this.controller.getModelParamsSnapshot();

//         this.setState({
//             model: {
//                 ...this.state.model,
//                 I: p.I,
//                 exponent: p.exponent,
//                 px: p.px,
//                 py: p.py,
//             },
//         });
//     }


//     // ----------------------------------------------------------
//     // componentWillUnmount：元件卸載時解除訂閱 (卸載前取消訂閱)
//     // 避免 controller 還在 notify 時呼叫 setState，造成 memory leak 警告
//     // ----------------------------------------------------------
//     componentWillUnmount() {
//         this.controller.unsubscribe(this.handleSceneUpdateFromController);

//         // [CHANGED] [Step 2] FeatureController 介面: 卸載時一併 dispose (釋放資源/取消內部 rAF/...)
//         this.controller.dispose();
//     }
    
//     // ----------------------------------------------------------
//     //  handleSceneUpdateFromController
//     //
//     //  Input:
//     //  - scene: SceneOutput（這裡不一定要用，但 listener 型別需要）
//     //
//     //  Output:
//     //  - void：同步 model params 回 UI state（slider 顯示）
//     // ----------------------------------------------------------
    // private handleSceneUpdateFromController(_scene: SceneOutput) {
    //     // // 從 single source of truth（Model）讀取最新參數
    //     // const p = this.model.getModelParams();

    //     // 從 single source of truth（Controller -> Model snapshot）讀取最新參數
    //     const p = this.controller.getModelParamsSnapshot();

    //     const model = {
    //             ...this.state.model,
    //             I: p.I,
    //             exponent: p.exponent,
    //             px: p.px,
    //             py: p.py,
    //         };

    //     // 只更新 model group，其他 UI 不動
    //     this.setState({ model });
    // }
    

//     // ----------------------------------------------------------
//     // handleExportClick：
//     //
//     // ----------------------------------------------------------
//     private handleExportClick() {
//         const graphRefClick = this.graphRef.current;
//         if (!graphRefClick) {
//             return;
//         }

//         const fileName = this.state.export.exportFileName;
//         graphRefClick.exportSvg(fileName);
//     }

//     // ==========================================================
//     // ControlsPanel -> AppView：狀態更新（巢狀 patch）
//     // ==========================================================
    
//     // ----------------------------------------------------------
//     // handleControlsStatePatch
//     // - ConsumerOptControlsPanel 會丟部分 patch 進來
//     // - 要在 AppView 做 merge（immutable）
//     // ----------------------------------------------------------
//     private handleControlsStatePatch(patch: Partial<ControlsState>) {
//         // 注意：patch 可能只包含 axis/title/tick/export 的其中之一
//         // 這裡做「一層 merge」
//         this.setState({
//             ...this.state,
//             ...patch,
//         });
//     }

//     // ----------------------------------------------------------
//     // handleViewOptionsPatch
//     // - viewOptions 統一入口

//     // Input:
//     // - patch: Partial<ConsumerViewOptions>
//     //
//     // Output:
//     // - void：更新 UI state.viewOptions + 呼叫 controller.setViewOptions(patch)
//     //
//     // ----------------------------------------------------------
//     private handleViewOptionsPatch(patch: Partial<State["viewOptions"]>) {
//         // 1) 先更新 UI state（讓 ControlsPanel 顯示一致）
//         this.setState({
//         viewOptions: {
//             ...this.state.viewOptions,
//             ...patch,
//         },
//         });

//         // 2) 再把 patch 丟給 controller（由 controller 決定 light rebuild）
//         this.controller.setViewOptions(patch);
//     }



//     // // ----------------------------------------------------------
//     // // handleAlphaFromController：
//     // // 當 controller 通知「scene 更新」時，AppView 讀取 model params，
//     // // 把最新的 a / I 同步回 UI state。
//     // //
//     // // 這個設計的本質：你把「單一真實來源」放在 Model，
//     // // AppView 只是把 Model 的值映射到 UI（slider）。
//     // //
//     // // ⚠️ 注意：你這裡同步 I 其實也合理，
//     // // 因為 controller 也可能更新 I（例如未來你允許拖曳預算線端點）
//     // // ----------------------------------------------------------
//     // private handleAlphaFromController() {
//     //   const p = this.model.getModelParams();
//     //   this.setState({ a: p.a, I: p.I });
//     // }

//     // ==========================================================
//     // ControlsPanel -> AppView：模型 sliders
//     // ==========================================================
//     // ----------------------------------------------------------
//     // handleIncomeChange
//     // - UI state 先改（滑桿受控）
//     // - 再通知 controller 更新 model（heavy rebuild）
//     // ----------------------------------------------------------
//     private handleIncomeChange(nextI: number) {
//         this.setState({
//             model: {
//                 ...this.state.model,
//                 I: nextI,
//             },
//         });

//         this.controller.onIncomeChange(nextI);
//     }

//     // ----------------------------------------------------------
//     // handleAlphaChange（你的 exponent 實際上是 alpha）
//     // ----------------------------------------------------------
//     private handleAlphaChange(nextAlpha: number) {
//         this.setState({
//             model: {
//                 ...this.state.model,
//                 exponent: nextAlpha,
//             },
//         });

//         this.controller.onAlphaChange(nextAlpha);
//     }

//     // ----------------------------------------------------------
//     // handlePxChange
//     // ----------------------------------------------------------
//     private handlePxChange(nextPx: number) {
//         this.setState({
//             model: {
//                 ...this.state.model,
//                 px: nextPx,
//             },
//         });

//         this.controller.onPxChange(nextPx);
//     }

//     // ----------------------------------------------------------
//     // handlePyChange
//     // ----------------------------------------------------------
//     private handlePyChange(nextPy: number) {
//         this.setState({
//             model: {
//                 ...this.state.model,
//                 py: nextPy,
//             },
//         });

//         this.controller.onPyChange(nextPy);
//     }

//     // ==========================================================
//     // ControlsPanel -> AppView：ticks 更新（上層規則）
//     // ==========================================================

//     // ----------------------------------------------------------
//     // handleChangeTicks: ControlPanel -> AppView -> controller/viewOptions
//     // - 控制 ticks 必須在 ALLOWED_TICKS 內
//     // - AppView 是規則擁有者（ControlsPanel 只是 UI）
//     // ----------------------------------------------------------
//     // private handleChangeTicks(nextTicks: number) {
//     //     // 防呆：只接受 ALLOWED_TICKS
//     //     let ok = false;
//     //     let i = 0;
//     //     while (i < ALLOWED_TICKS.length) {
//     //         if (ALLOWED_TICKS[i] === nextTicks) {
//     //             ok = true;
//     //         }
//     //         i += 1;
//     //     }

//     //     if (!ok) {
//     //         return;
//     //     }

//     //     this.setState({
//     //         tick: {
//     //             ...this.state.tick,
//     //             ticks: nextTicks,
//     //         },
//     //     });
//     // }
//     private handleChangeTicks(nextTick: number) {
//         // 1) validate
//         if (!ALLOWED_TICKS.includes(nextTick)) {
//             return;
//         }

//         // 2) state update
//         this.setState({
//             tick: {
//                 ...this.state.tick,
//                 ticks: nextTick,
//             },
//         });
//     }


//     // ----------------------------------------------------------
//     // render：渲染 UI
//     // - 左側：slider 控制
//     // - 右側：ConsumerOptGraphView（圖）
//     //
//     // 你目前 px/py 固定成 1，只顯示出來，不提供 slider
//     // ----------------------------------------------------------
//     render() {
//         const tickVisibility: TickVisibility = {  
//             showTickLines: this.state.tick.showTickLines,
//             showTickLabels: this.state.tick.showTickLabels,
//         };

//         // 左側 controls panel
//         const controlsPanel = (
//             <ConsumerOptControlsPanel
//                 state={this.state}
//                 onChangeState={this.handleControlsStatePatch}
//                 onViewOptionsChange={this.handleViewOptionsPatch}
//                 onChangeTicks={this.handleChangeTicks}
//                 onExportClick={this.handleExportClick}
//                 onIncomeChange={this.handleIncomeChange}
//                 onAlphaChange={this.handleAlphaChange}
//                 onPxChange={this.handlePxChange}
//                 onPyChange={this.handlePyChange}
//             />
//         );

//         // 右側 graph
//         const graphPanel = (
//             <ConsumerOptGraphView
//                 ref={this.graphRef}
//                 controller={this.controller}
//                 ticks={this.state.tick.ticks}
//                 tickVisibility={tickVisibility}
//                 xLabel={this.state.axis.xLabel}
//                 yLabel={this.state.axis.yLabel}
//                 showXLabel={this.state.axis.showXLabel}
//                 showYLabel={this.state.axis.showYLabel}
//                 chartTitle={this.state.title.chartTitle}
//                 showChartTitle={this.state.title.showChartTitle}
//                 chartTitleFontSize={this.state.title.chartTitleFontSize}
//             />
//         );

//         return (
//             <div style={{ padding: 16 }}>
//                 <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
//                     {controlsPanel}
//                     {graphPanel}
//                 </div>
//             </div>
//         );
//     }
// }
