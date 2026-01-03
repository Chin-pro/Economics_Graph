// src/app/AppView.tsx

// ------------------------------------------------------------
// AppView：你的「應用程式最上層 View」(React class component)
// 角色：
// 1) 建立 Model（狀態/經濟計算）
// 2) 建立 Controller（協調 Model、產生 Scene、通知 View）
// 3) 建立 GraphView（SVG 畫布呈現）
// 4) 管理 slider 的 UI state（I, a）
// 5) 讓拖曳點更新 a 時，slider 也能同步更新（雙向同步）
//
// 在 MVC 的語言裡：
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

// ControlledSlider : 匯入拖曳條組件
import { ControlledSlider } from "../common/ControlledSlider";

import type { TickVisibility } from "../MVC/view/axesTicks";
import { computeInnerAvailSize } from "../core/layout";


// ------------------------------------------------------------
// ALLOWED_TICKS: 限制 ticks 值: 避免奇怪數字 (1, 2, 4, 5, 10)
// ------------------------------------------------------------
const ALLOWED_TICKS: number[] = [1, 2, 4, 5, 10]; 

// ------------------------------------------------------------
// AppView 的 state：
// - I：收入 slider 顯示用（UI state）
// - a：alpha slider 顯示用（UI state）
//
// 注意：Model 內也有一份 I/a（Model state）
// - slider 改變：AppView setState + controller 更新 model
// - 拖曳點改變：controller 更新 model，並 notify，AppView 再 setState 同步 slider
// ------------------------------------------------------------
type State = {
  // 模型相關 (UI 顯示用)
  I: number;
  exponent: number;
  px: number;
  py: number;

  // 圖表控制 (純 UI)
  ticks: number;
  showTickLines: boolean;
  showTickLabels: boolean;

  // 軸標籤 (變數名稱)
  xLabel: string;
  yLabel: string;

  // 圖表標題 (會出現在 SVG 內)
  chartTitle: string;

  // 匯出檔名
  exportFileName: string;

  // 線段顏色 (線段 + 方程式標籤共用)
  budgetColor: string;
  indiffColor: string;

  showEquationLabels: boolean;
  equationFontSize: number;

  showOpt: boolean;
  optPointColor: string;
  optTextColor: string;

  showXLabel: boolean;
  showYLabel: boolean;

  showChartTitle: boolean;
  chartTitleFontSize: number;
};

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

    // 2) 初始化 UI state（slider 顯示用）
    this.state = { 
      I: initialParameters.I, 
      exponent: initialParameters.exponent,
      px: initialParameters.px,
      py: initialParameters.py,

      ticks: 5,
      showTickLines: true,
      showTickLabels: true,

      xLabel: "x",
      yLabel: "y",

      chartTitle: "Consumer Optimum (Cobb-Douglas)",
      exportFileName: "figure-consumer-opt.svg",

      budgetColor: "#111111",
      indiffColor: "#111111",


      showEquationLabels: true,
      equationFontSize: 12,

      showOpt: true,
      optPointColor: "#111111",
      optTextColor: "#111111",

      showXLabel: true,
      showYLabel: true,

      showChartTitle: true,
      chartTitleFontSize: 14,
    };

    // 3) 建立 Model：把初始參數塞進去
    //    注意：Model 內部自己保存一份 params
    //    等價於:
    //      " this.model = new ConsumerOptModel({ 
    //          I: initialParameters.I, 
    //          a: initialParameters.a, 
    //          px: initialParameters.px, 
    //          py: initialParameters.py
    //        })"
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
      innerWidth: inner.innerWidth,
      innerHeight: inner.innerHeight,
      model: this.model,
    });

    this.graphRef = React.createRef<ConsumerOptGraphView>();


    // 5) bind：class component 綁定 this
    //    因為下面會把 handler 當 callback 傳給 onChange / subscribe
    //    當 callback 傳遞時才不會 this=undefined
    this.handleParamsFromController = this.handleParamsFromController.bind(this);

    // this.handleIncomeChange = this.handleIncomeChange.bind(this);
    // this.handleAlphaChange = this.handleAlphaChange.bind(this);
    
    // this.handlePxChange = this.handlePxChange.bind(this);
    // this.handlePyChange = this.handlePyChange.bind(this);

    // this.handleModelSyncFromController = this.handleModelSyncFromController.bind(this);

    this.handleExportClick = this.handleExportClick.bind(this);

    // ??? 你也可以保留 handleIncomeChange/handleAlphaChange，但這裡直接用 slider onChange inline 即可

    this.controller.setShowEquationLabels(this.state.showEquationLabels);
    this.controller.setEquationFontSize(this.state.equationFontSize);
    this.controller.setShowOpt(this.state.showOpt);
    this.controller.setOptPointColor(this.state.optPointColor);
    this.controller.setOptTextColor(this.state.optTextColor);
  }

  // ----------------------------------------------------------
  // componentDidMount：(mounted 後才訂閱)
  // 安全：確保組件真的出現在畫面上，避免組件尚未掛載即渲染
  // this.setState({ I:p.I, a:p.a })：確保訂閱開始後，UI state 立刻跟
  // model state 對齊，避免極端時序下不同步
  // ----------------------------------------------------------
  componentDidMount(){
    this.controller.subscribe(this.handleParamsFromController);

    // 確保 mounted 後 UI state 跟 model params 完全一致
    const params = this.model.getModelParams();
    this.setState({ I: params.I, exponent: params.exponent, px: params.px, py: params.py });
  }


  // ----------------------------------------------------------
  // componentWillUnmount：元件卸載時解除訂閱 (卸載前取消訂閱)
  // 避免 controller 還在 notify 時呼叫 setState，造成 memory leak 警告
  // ----------------------------------------------------------
  componentWillUnmount() {
    this.controller.unsubscribe(this.handleParamsFromController);
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
  // handleParamsFromController：
  // 當 controller 通知「scene 更新」時，AppView 讀取 model params，
  // 把最新的 I/a/px/py 同步回 UI state。
  //
  // 這個設計的本質：你把「單一真實來源」放在 Model，
  // AppView 只是把 Model 的值映射到 UI（slider）。
  // ----------------------------------------------------------
  private handleParamsFromController() {
    const params = this.model.getModelParams();
    this.setState({ I: params.I, exponent: params.exponent, px: params.px, py: params.py });
  }


  // ----------------------------------------------------------
  // handleExportClick：
  //
  // ----------------------------------------------------------
  private handleExportClick() {
    const graphRefClick = this.graphRef.current;
    if (!graphRefClick) {
      return;
    }
    graphRefClick.exportSvg(this.state.exportFileName);
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


  // // ----------------------------------------------------------
  // // handleIncomeChange：收入 slider 改變
  // //
  // // 做兩件事：
  // // 1) 更新 AppView 的 UI state（讓 slider 顯示正確）
  // // 2) 通知 controller：更新 model + rebuild scene + notify view
  // // 
  // // e: React.ChangeEvent<HTMLInputElement>: 代表 e.target 是一個 HTMLInputElement
  // // ----------------------------------------------------------
  // private handleIncomeChange(e: React.ChangeEvent<HTMLInputElement>) {
  //   const nextI = Number(e.currentTarget.value);

  //   // 更新 UI state（這會觸發 AppView render，使 UI 文字/slider 改變）
  //   this.setState({ I: nextI });

  //   // 通知 controller：這才是真正讓圖重算的來源
  //   this.controller.onIncomeChange(nextI);
  // }

  // // ----------------------------------------------------------
  // // handleAlphaChange：alpha slider 改變
  // // 同樣做 UI state + controller 更新
  // // ----------------------------------------------------------
  // private handleAlphaChange(e: React.ChangeEvent<HTMLInputElement>) {
  //   const nextA = Number(e.currentTarget.value);

  //   this.setState({ a: nextA });
  //   this.controller.onAlphaChange(nextA);
  // }

  // // ----------------------------------------------------------
  // // handlePxChange (px slider) & handlePyChange (py slider)：
  // //  - 先更新 UI state (受控的組件的方式)
  // //  - 再叫 controller 更新 model + 重算 scene + notify
  // // ----------------------------------------------------------
  // private handlePxChange(nextPx: number) {
  //   this.setState({ px: nextPx });
  //   this.controller.onPxChange(nextPx);
  // }

  // private handlePyChange(nextPy: number) {
  //   this.setState({ py: nextPy });
  //   this.controller.onPyChange(nextPy);
  // }


  // ----------------------------------------------------------
  // render：渲染 UI
  // - 左側：slider 控制
  // - 右側：ConsumerOptGraphView（圖）
  //
  // 你目前 px/py 固定成 1，只顯示出來，不提供 slider
  // ----------------------------------------------------------
  render() {
    const tickVisibility: TickVisibility = {
      showTickLines: this.state.showTickLines,
      showTickLabels: this.state.showTickLabels,
    }

    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          {/* -----------------------------
              左側：所有控制項統一放這裡
             ----------------------------- */}
          <div style={{ width: 340, display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: 0 }}>Controls Panel</h3>

            {/* -------------------------
               顯示控制（需求1）
            ------------------------- */}
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Visibility</div>

              <label style={{ display: "block", marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={this.state.showEquationLabels}
                  onChange={(e) => {
                    const v = e.currentTarget.checked;
                    this.setState({ showEquationLabels: v });
                    this.controller.setShowEquationLabels(v);
                  }}
                />
                {" "}顯示方程式文字標籤
              </label>

              <label style={{ display: "block", marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={this.state.showOpt}
                  onChange={(e) => {
                    const v = e.currentTarget.checked;
                    this.setState({ showOpt: v });
                    this.controller.setShowOpt(v);
                  }}
                />
                {" "}顯示 Opt（點 + 文字）
              </label>

              <label style={{ display: "block", marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={this.state.showXLabel}
                  onChange={(e) => this.setState({ showXLabel: e.currentTarget.checked })}
                />
                {" "}顯示 X 軸變數名稱
              </label>

              <label style={{ display: "block", marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={this.state.showYLabel}
                  onChange={(e) => this.setState({ showYLabel: e.currentTarget.checked })}
                />
                {" "}顯示 Y 軸變數名稱
              </label>

              <label style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={this.state.showChartTitle}
                  onChange={(e) => this.setState({ showChartTitle: e.currentTarget.checked })}
                />
                {" "}顯示圖片標題
              </label>
            </div>

            {/* -------------------------
               字體大小（需求1）
            ------------------------- */}
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Font sizes</div>

              <ControlledSlider
                label="Equation label font"
                min={8}
                max={24}
                step={1}
                value={this.state.equationFontSize}
                onChange={(next) => {
                  this.setState({ equationFontSize: next });
                  this.controller.setEquationFontSize(next);
                }}
              />

              <ControlledSlider
                label="Title font"
                min={10}
                max={26}
                step={1}
                value={this.state.chartTitleFontSize}
                onChange={(next) => this.setState({ chartTitleFontSize: next })}
              />
            </div>

            {/* 圖表標題（會顯示在 SVG 內） */}
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Chart title</div>
              <input
                value={this.state.chartTitle}
                onChange={(e) => this.setState({ chartTitle: e.currentTarget.value })}
                style={{ width: "100%" }}
              />
            </div>

            {/* 匯出檔名 */}
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Export file name</div>
              <input
                value={this.state.exportFileName}
                onChange={(e) => this.setState({ exportFileName: e.currentTarget.value })}
                style={{ width: "100%" }}
              />
              <button onClick={this.handleExportClick} style={{ marginTop: 8 }}>
                Export SVG
              </button>
            </div>

            {/* 軸變數名稱 */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>X-axis label</div>
                <input
                  value={this.state.xLabel}
                  onChange={(e) => this.setState({ xLabel: e.currentTarget.value })}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Y-axis label</div>
                <input
                  value={this.state.yLabel}
                  onChange={(e) => this.setState({ yLabel: e.currentTarget.value })}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* ticks */}
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Ticks</div>
              <select
                value={this.state.ticks}
                onChange={(e) => {
                  const raw = Number(e.currentTarget.value);

                  // 防呆：只接受 ALLOWED_TICKS
                  let ok = false;
                  let i = 0;
                  while (i < ALLOWED_TICKS.length) {
                    if (ALLOWED_TICKS[i] === raw) {
                      ok = true;
                    }
                    i += 1;
                  }
                  if (ok) {
                    this.setState({ ticks: raw });
                  }
                }}
                style={{ width: "100%" }}
              >
                {ALLOWED_TICKS.map((v) => (
                  <option key={`ticks-${v}`} value={v}>
                    {v}
                  </option>
                ))}
              </select>

              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={this.state.showTickLines}
                    onChange={(e) => this.setState({ showTickLines: e.currentTarget.checked })}
                  />
                  顯示刻度線
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={this.state.showTickLabels}
                    onChange={(e) => this.setState({ showTickLabels: e.currentTarget.checked })}
                  />
                  顯示刻度文字
                </label>
              </div>
            </div>

            {/* 線段顏色（線與方程式標籤會一起變色） */}
            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                Budget color
                <input
                  type="color"
                  value={this.state.budgetColor}
                  onChange={(e) => {
                    const c = e.currentTarget.value;
                    this.setState({ budgetColor: c });
                    this.controller.setBudgetColor(c);
                  }}
                />
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                Indiff color
                <input
                  type="color"
                  value={this.state.indiffColor}
                  onChange={(e) => {
                    const c = e.currentTarget.value;
                    this.setState({ indiffColor: c });
                    this.controller.setIndiffColor(c);
                  }}
                />
              </label>
            </div>
            
             {/* ✅（需求3）Opt 顏色 */}
            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                Opt point
                <input
                  type="color"
                  value={this.state.optPointColor}
                  onChange={(e) => {
                    const c = e.currentTarget.value;
                    this.setState({ optPointColor: c });
                    this.controller.setOptPointColor(c);
                  }}
                />
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                Opt text
                <input
                  type="color"
                  value={this.state.optTextColor}
                  onChange={(e) => {
                    const c = e.currentTarget.value;
                    this.setState({ optTextColor: c });
                    this.controller.setOptTextColor(c);
                  }}
                />
              </label>
            </div>


            {/* 模型參數 sliders */}
            <ControlledSlider
              label="Income I"
              min={5}
              max={60}
              value={this.state.I}
              onChange={(nextI) => {
                this.setState({ I: nextI });
                this.controller.onIncomeChange(nextI);
              }}
            />

            <ControlledSlider
              label="a (x exponent)"
              min={0.1}
              max={0.9}
              step={0.01}
              value={Number(this.state.exponent.toFixed(2))}
              onChange={(nextA) => {
                this.setState({ exponent: nextA });
                this.controller.onAlphaChange(nextA);
              }}
            />

            <ControlledSlider
              label="Price px"
              value={this.state.px}
              min={0.1}
              max={5}
              step={0.1}
              onChange={(nextPx) => {
                this.setState({ px: nextPx });
                this.controller.onPxChange(nextPx);
              }}
            />

            <ControlledSlider
              label="Price py"
              value={this.state.py}
              min={0.1}
              max={5}
              step={0.1}
              onChange={(nextPy) => {
                this.setState({ py: nextPy });
                this.controller.onPyChange(nextPy);
              }}
            />
          </div>

          {/* -----------------------------
              右側：GraphView 只負責畫圖
             ----------------------------- */}
          <div>
            <ConsumerOptGraphView
              ref={this.graphRef}
              controller={this.controller}
              ticks={this.state.ticks}
              tickVisibility={tickVisibility}
              xLabel={this.state.xLabel}
              yLabel={this.state.yLabel}
              showXLabel={this.state.showXLabel}
              showYLabel={this.state.showYLabel}
              chartTitle={this.state.chartTitle}
              showChartTitle={this.state.showChartTitle}
              chartTitleFontSize={this.state.chartTitleFontSize}
            />
          </div>
        </div>
      </div>
    );
  }
}
