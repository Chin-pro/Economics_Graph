// src/features/consumerOpt/ui/ConsumerOptRoot.tsx
// ------------------------------------------------------------
// ConsumerOptRoot (Feature Root UI): consumerOpt feature 的 UI 組裝點
// - 左側：ConsumerOptControlsPanel (純 UI: slider/checkbox，產出 patch/callback)
// - 右側：ConsumerOptGraphView (圖形 View，訂閱 controller、用 renderer 畫 scene)
//
// SRP / SOLID：
// - ConsumerOptRoot.tsx 只做「UI 組裝 + UI state wiring + 呼叫 controller」
// - 不進行 econ 計算 (econ 在 model)
// - 不直接操作 renderer 細節（SvgSceneView/renderer 內部自己處理）
//
// 為什麼要把這個檔案放在 feature/consumerOpt/ui 內？
// - 讓 App層面 (AppView/FeatureHost) 完全不知道 consumerOpt 
//   有哪些 controls (Ex: slider/checkbox/graph props)
// - 未來新增 feature (供需/賽局/GE)，只要新增各自的 Root UI，不用動 AppView
//
// 為甚麼 Root 也要 subscribe controller?
// - GraphView 會訂閱 controller: 為了重畫圖 (scene 更新)
// - Root 也會訂閱 controller: 為了把 controller 的 model snapshot 同步回slider 顯示 (UI State)
// - 同一個 controller 有多個 subscriber 是正常設計 (Observer pattern)
//
// LifeCycle:
// - Root 不是 controller 的 owenr，FeatureHost 才是
// - Root 在 unmount 時，只負責 unsubscribe 自己的 listener
// - controller.dispose() 應該由 owner (FeatureHost) 在 feature switch / unmount 時負責呼叫
// ------------------------------------------------------------

import React from "react";

// Controller：接 UI 事件、更新 model、build scene、notify listeners
import type { ConsumerOptController } from "../controller/ConsumerOptController";

// GraphView：SVG 容器 + 訂閱 controller 更新 + 拿 scene 來畫 (renderer 內部處理)
import { ConsumerOptGraphView } from "../view/ConsumerOptGraphView";

// ticks 的顯示選項型別（GraphView 用）
import type { TickVisibility } from "../view/axesTicks";

// ------------------------------------------------------------
//  引入「純 UI 控制面板」ConsumerOptControlsPanel
//  - 已經將 ControlsPanel 抽離成獨立檔案 (SRP)
// ------------------------------------------------------------
import { ConsumerOptControlsPanel } from "./ConsumerOptControlsPanel";

// ControlsState + 預設值/常數都由 controlPanel 統一出口提供
import {
    ALLOWED_TICKS,
    DEFAULT_CONSUMER_PARAMS,
    createDefaultControlsState,
    type ControlsState,
} from "./controlPanel";

// ----------------------------------------------------------
//  Props
//  Input:
//  - controller: ConsumerOptController
//    這個 feature 的互動入口（接收 UI 事件、更新 model、重建 scene、通知 subscribers）
//
//  Output:
//  - 無（Props 型別只是 compile-time 合約）
// ----------------------------------------------------------
type Props = {
    controller: ConsumerOptController;
};

type State = ControlsState;

// ----------------------------------------------------------
//  ConsumerOptRoot
//  - 作為 consumerOpt 這個 feature 的 UI「組裝根元件」
//  - 負責管理 ControlsState (UI state) 並把 UI 事件轉成 controller 呼叫
//  - 透過訂閱 controller，在 scene 更新時，把 model snapshot 同步回 slider 顯示
//
//  Input:
//  - controller: ConsumerOptController（feature 的互動入口）
//
//  Output:
//  - React.ReactNode (ReactElement)：左 Controls + 右 Graph 的 UI
// ----------------------------------------------------------
export class ConsumerOptRoot extends React.Component<Props, State> {
    // 用 ref 拿到 GraphView，才能從左側按鈕呼叫 exportSvg
    private graphRef: React.RefObject<ConsumerOptGraphView | null>;
    
    // ----------------------------------------------------------
    //  constructor：綁定事件、建立同步訂閱
    //  - 初始化 UI state (ControlsState)
    //  - 初始化 graphRef (用於 export)
    //  - 綁定 class methods 的 this (避免作為 callback 時 this 丟失)
    //  
    //  Input:
    //  -props: Props (包含 controller)
    //
    //  Output: (void)
    // ----------------------------------------------------------
    public constructor(props: Props) {  // 組件傳入參數 props
        super(props);

        this.graphRef = React.createRef<ConsumerOptGraphView>();

        //  初始化 UI state（完全用 ControlsState 結構）
        //  - 只負責 wiring，不應該塞大量預設值細節，預設值集中在 createDefaultControlsState()
        this.state = createDefaultControlsState(DEFAULT_CONSUMER_PARAMS);

        // bind：class component 綁定 this，確保 callback 的 this 指向 Root instance
        this.handleSceneUpdateFromController = this.handleSceneUpdateFromController.bind(this);
        this.handleControlsStatePatch = this.handleControlsStatePatch.bind(this);
        this.handleViewOptionsPatch = this.handleViewOptionsPatch.bind(this);

        this.handleIncomeChange = this.handleIncomeChange.bind(this);
        this.handleAlphaChange = this.handleAlphaChange.bind(this);
        this.handlePxChange = this.handlePxChange.bind(this);
        this.handlePyChange = this.handlePyChange.bind(this);

        this.handleChangeTicks = this.handleChangeTicks.bind(this);
        this.handleExportClick = this.handleExportClick.bind(this);
    }

    // ----------------------------------------------------------
    //  componentDidMount：(mounted 後才訂閱)
    //  - 安全：確保組件真的出現在畫面上，避免組件尚未掛載即渲染
    //
    //  - 在元件真正 mounted 後才 subscribe，避免時序問題
    //  - 把 UI 的 viewOptions 同步進 controller (確保 controller 內部狀態與 UI 一樣)
    //  - 以 controller snapshot 回寫 UI (避免初始化飄移)
    //
    //  Input: empty
    //
    //  Output: (void)
    // ----------------------------------------------------------
    public componentDidMount(): void {
        const controller = this.props.controller;

        // ConsumerOptRoot 訂閱 controller 更新：用 controller 的 snapshot 回寫 UI（slider 顯示）
        controller.subscribe(this.handleSceneUpdateFromController);

        // mount 後：把 UI 的 viewOptions 整包同步進 controller
        controller.setViewOptions(this.state.viewOptions);

        // mount 後：用 controller 快照回寫 UI（保險，避免初始化漂移）
        const params = controller.getModelParamsSnapshot();

        // this.setState(...)：回寫入 model
        // 確保訂閱開始後，UI state 立刻跟 model state 對齊，避免極端時序下不同步
        this.setState({
            model: {
                ...this.state.model,
                I: params.I,
                exponent: params.exponent,
                px: params.px,
                py: params.py,
            },
        });
    }

    // ----------------------------------------------------------
    //  componentWillUnmount：元件卸載時解除訂閱 (卸載前取消訂閱)
    //  - 避免 controller 還在 notify 時呼叫 setState，造成 memory leak 警告
    //  - Root 不是 controller owner，因此不呼叫 controller.dispose()
    //
    //  Input: empty
    //
    //  Output: (void)
    // ----------------------------------------------------------
    public componentWillUnmount(): void {
        const controller = this.props.controller;
        controller.unsubscribe(this.handleSceneUpdateFromController);
    }

    // ----------------------------------------------------------
    //  handleSceneUpdateFromController
    //  - UI：scene 更新 → controller → Root 的通知回呼 → 同步 model params 給 slider 顯示
    //  - Root 採用 pull-model: 收到 notify 後，再向 controller 拉取 snapshot
    //
    //  Input: empty
    //
    //  Output:
    //  - void：透過 setState 同步 model params，更新 UI (slider 顯示)
    // ----------------------------------------------------------
    private handleSceneUpdateFromController(): void {
        const controller = this.props.controller;

        // 從 single source of truth（Controller -> Model snapshot）讀取最新參數快照
        const p = controller.getModelParamsSnapshot();

        // 僅更新 model，其他 UI 不動
        // [Reserve] 使用 fuctional setState: (prev) => {}，避免連續通知 (drag) 時 state 被舊閉包覆蓋
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


    // ==========================================================
    // ControlsPanel -> Root：狀態更新（巢狀 patch）
    // ==========================================================

    // ----------------------------------------------------------
    //  handleControlsStatePatch
    //  - ControlsPanel 會把「已經 merge 好的 group」用 patch 形式交給 Root
    //  - Root 只要把 patch 套進 state（React class setState 會做 top-level shallow merge）
    // 
    //  Input:
    //  - patch: Partial<ControlsState>
    //  - 可能只包含 axis/title/tick/export/model/viewOptions 的其中一組或多組
    //
    //  Output: (void)
    //  - 透過 setState 更新 UI
    // ----------------------------------------------------------
    private handleControlsStatePatch(patch: Partial<ControlsState>): void {
        // patch 通常是某一個 group（axis/title/tick/export/model）
        // 這裡做 top-level merge
        this.setState({
            ...this.state,
            ...patch,
        });
    }

    // ----------------------------------------------------------
    //  handleViewOptionsPatch
    //  - viewOptions 統一入口（LIGHT 更新）
    //
    //  Input:
    //  - path: Partial<State["viewOption"]>
    //
    //  Output:
    //  - void: 更新 UI state.viewOptions + 呼叫 controller.setViewOptions(path)
    // ----------------------------------------------------------
    private handleViewOptionsPatch(patch: Partial<State["viewOptions"]>): void {
        // 1) 先更新 UI state (讓 ControlsPanel 顯示一致)
        this.setState({
            viewOptions: {
                ...this.state.viewOptions,
                ...patch,
            },
        });

        // 2) 再將 path 丟給 controller
        // 由 controller 決定 LIGHT 路徑（目前只更新 viewOptions，不重算 econ）
        this.props.controller.setViewOptions(patch);
    }

    // ==========================================================
    //  model sliders（HEAVY 更新）
    // ----------------------------------------------------------
    //  - 這個設計的本質：把「單一真實來源」放在 Model，
    //    ConsumerOptRoot 只是把 Model 的值映射到 UI（slider）
    //  - UI state 先改動，通知 controller 通知「scene 更新」時，讀取最新 model，
    //    並將最新參數同步回 UI state
    // ==========================================================
    // ----------------------------------------------------------
    //  handleIncomeChange
    // ----------------------------------------------------------
    private handleIncomeChange(nextI: number): void {
        this.setState({
            model: {
                ...this.state.model,
                I: nextI,
            },
        });

        this.props.controller.onIncomeChange(nextI);
    }

    // ----------------------------------------------------------
    //  handleAlphaChange：
    // ----------------------------------------------------------
    private handleAlphaChange(nextAlpha: number): void {
        this.setState({
            model: {
                ...this.state.model,
                exponent: nextAlpha,
            },
        });

        this.props.controller.onAlphaChange(nextAlpha);
    }

    // ----------------------------------------------------------
    //  handlePxChange：
    // ----------------------------------------------------------
    private handlePxChange(nextPx: number): void {
        this.setState({
            model: {
                ...this.state.model,
                px: nextPx,
            },
        });

        this.props.controller.onPxChange(nextPx);
    }

    // ----------------------------------------------------------
    //  handlePyChange：
    // ----------------------------------------------------------
    private handlePyChange(nextPy: number): void {
        this.setState({
            model: {
                ...this.state.model,
                py: nextPy,
            },
        });

        this.props.controller.onPyChange(nextPy);
    }


    // ==========================================================
    //  ticks（純 UI + 防呆）
    // ==========================================================

    // ----------------------------------------------------------
    //  handleChangeTicks: ControlPanel -> AppView -> controller/viewOptions ?????
    //  - 控制 ticks 必須在 ALLOWED_TICKS 內
    //  - AppView 是規則擁有者（ControlsPanel 只是 UI） ??????
    // ----------------------------------------------------------
    private handleChangeTicks(nextTicks: number): void {
        // 防呆機制: 只接受 ALLOWED_TICKS
        if (!ALLOWED_TICKS.includes(nextTicks)) {
            return;
        }
        this.setState({
            tick: {
                ...this.state.tick,
                ticks: nextTicks,
            },
        });
    }


    // ==========================================================
    // export
    // ==========================================================

    // ----------------------------------------------------------
    //  handleExportClick：
    //  - 
    // ----------------------------------------------------------
    private handleExportClick(): void {
        const ref = this.graphRef.current;
        if (!ref) {
            return;
        }

        ref.exportSvg(this.state.export.exportFileName);
    }

    // ----------------------------------------------------------
    //  render：渲染 UI
    //  - 左側：slider 控制
    //  - 右側：ConsumerOptGraphView（圖）
    // ----------------------------------------------------------
    public render(): React.ReactNode {
        const tickVisibility: TickVisibility = {
            showTickLines: this.state.tick.showTickLines,
            showTickLabels: this.state.tick.showTickLabels,
        };

        return (
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                {/* 左側 controls panel */}
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
                {/* 右側 graph */}
                <ConsumerOptGraphView
                    ref={this.graphRef}
                    controller={this.props.controller}
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
            </div>
        );
    }
}
