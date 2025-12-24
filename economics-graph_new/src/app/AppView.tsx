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
  I: number;
  a: number;
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

  // ----------------------------------------------------------
  // constructor：初始化 UI state、建立 MVC 物件、綁定事件、建立同步訂閱
  // ----------------------------------------------------------
  constructor(props: Record<string, never>) {  // 組件傳入參數 props
    super(props);

    // 1) 初始化參數
    const initialParameters: ConsumerParams = { I: 20, a: 0.5, px: 1, py: 1}

    // 2) 初始化 UI state（slider 顯示用）
    this.state = { I: initialParameters.I, a: initialParameters.a };

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
    this.controller = new ConsumerOptController({
      innerW: 520 - 40 - 20,   // 需要修改 Hard coding!!!
      innerH: 360 - 20 - 30,
      model: this.model,
    });

    // 5) bind：class component 綁定 this
    //    因為下面會把 handler 當 callback 傳給 onChange / subscribe
    //    當 callback 傳遞時才不會 this=undefined
    this.handleIncomeChange = this.handleIncomeChange.bind(this);
    this.handleAlphaChange = this.handleAlphaChange.bind(this);
    this.handleAlphaFromController = this.handleAlphaFromController.bind(this);
  }

  // ----------------------------------------------------------
  // componentDidMount：(mounted 後才訂閱)
  // 安全：確保組件真的出現在畫面上，避免組件尚未掛載即渲染
  // this.setState({ I:p.I, a:p.a })：確保訂閱開始後，UI state 立刻跟
  // model state 對齊，避免極端時序下不同步
  // ----------------------------------------------------------
  componentDidMount(){
    this.controller.subscribe(this.handleAlphaFromController);

    // 確保 mounted 後 UI state 跟 model params 完全一致
    const p = this.model.getModelParams();
    this.setState({ I:p.I, a:p.a });
  }


  // ----------------------------------------------------------
  // componentWillUnmount：元件卸載時解除訂閱 (卸載前取消訂閱)
  // 避免 controller 還在 notify 時呼叫 setState，造成 memory leak 警告
  // ----------------------------------------------------------
  componentWillUnmount() {
    this.controller.unsubscribe(this.handleAlphaFromController);
  }

  // ----------------------------------------------------------
  // handleAlphaFromController：
  // 當 controller 通知「scene 更新」時，AppView 讀取 model params，
  // 把最新的 a / I 同步回 UI state。
  //
  // 這個設計的本質：你把「單一真實來源」放在 Model，
  // AppView 只是把 Model 的值映射到 UI（slider）。
  //
  // ⚠️ 注意：你這裡同步 I 其實也合理，
  // 因為 controller 也可能更新 I（例如未來你允許拖曳預算線端點）
  // ----------------------------------------------------------
  private handleAlphaFromController() {
    const p = this.model.getModelParams();
    this.setState({ a: p.a, I: p.I });
  }

  // ----------------------------------------------------------
  // handleIncomeChange：收入 slider 改變
  //
  // 做兩件事：
  // 1) 更新 AppView 的 UI state（讓 slider 顯示正確）
  // 2) 通知 controller：更新 model + rebuild scene + notify view
  // 
  // e: React.ChangeEvent<HTMLInputElement>: 代表 e.target 是一個 HTMLInputElement
  // ----------------------------------------------------------
  private handleIncomeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextI = Number(e.currentTarget.value);

    // 更新 UI state（這會觸發 AppView render，使 UI 文字/slider 改變）
    this.setState({ I: nextI });

    // 通知 controller：這才是真正讓圖重算的來源
    this.controller.onIncomeChange(nextI);
  }

  // ----------------------------------------------------------
  // handleAlphaChange：alpha slider 改變
  // 同樣做 UI state + controller 更新
  // ----------------------------------------------------------
  private handleAlphaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextA = Number(e.currentTarget.value);

    this.setState({ a: nextA });
    this.controller.onAlphaChange(nextA);
  }

  // ----------------------------------------------------------
  // render：渲染 UI
  // - 左側：slider 控制
  // - 右側：ConsumerOptGraphView（圖）
  //
  // 你目前 px/py 固定成 1，只顯示出來，不提供 slider
  // ----------------------------------------------------------
  render() {
    // 設定 px/py ，使其永遠與 model 同步
    const { px, py } = this.model.getModelParams();

    // // 設定字體 (挪移到 index.css 去進行統一調整)
    // const applySystemFont = 
    //   '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SP Pro Display", "Helvetica Neue", Arial, sans-serif';

    return (
      <div style={{ padding: 16 }}> {/* "{ padding: 16 }" 為一個 TS 物件 */}
        <h2>Consumer Optimum (Cobb-Douglas)</h2>

        {/* flex layout：左 slider、右圖 */}
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div>
            {/* Income slider */}
            <div style={{ marginBottom: 12 }}>
              <label>
                {/* Income I: {this.state.I} */}
                {/* <input
                  type="range"
                  min={5}
                  max={60}
                  value={this.state.I}
                  onChange={this.handleIncomeChange}
                /> */}
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
              </label>
            </div>

            {/* alpha slider */}
            <div style={{ marginBottom: 12 }}>
              <label>
                {/* <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.01}
                  value={this.state.a}
                  onChange={this.handleAlphaChange}
                /> */}
                <ControlledSlider
                  label="a (x exponent)"
                  min={0.1}
                  max={0.9}
                  step={0.01}
                  value={Number(this.state.a.toFixed(2))}
                  onChange={(nextA) => {
                    this.setState({ a: nextA });
                    this.controller.onAlphaChange(nextA)
                  }}
                />
              </label>
            </div>

            {/* 顯示價格（目前固定） */}
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              px = {px}, py = {py}
            </div>
          </div>

          {/* 
          GraphView：只需要 controller（因為它會向 controller 訂閱 scene 更新）
              因為 GraphView 的責任是：
                1.向 controller 訂閱 scene；
                2.把 scene render 成 SVG 
          */}
          <ConsumerOptGraphView controller={this.controller} />
        </div>
      </div>
    );
  }
}
