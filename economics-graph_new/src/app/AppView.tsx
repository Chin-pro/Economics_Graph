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
// ------------------------------------------------------------

import React from "react";

// Model：保存參數 + 提供 econ compute
import { ConsumerOptModel } from "../MVC/model/ConsumerOptModel";

// Controller：接 UI 事件、更新 model、build scene、notify listeners
import { ConsumerOptController } from "../MVC/controller/ConsumerOptController";

// GraphView：SVG 容器 + 訂閱 controller 更新 + renderer (SvgSceneView)
import { ConsumerOptGraphView } from "../MVC/view/ConsumerOptGraphView";

// ------------------------------------------------------------
// AppView 的 state：
// - I：收入 slider 顯示用（UI state）
// - a：alpha slider 顯示用（UI state）
//
// 這裡特別重要：你同時也在 Model 裡保存 I,a。
// 所以「UI state」跟「Model state」會變成兩份。
// 你目前用 subscribe 來同步它們（避免不同步）。
// ------------------------------------------------------------
type State = {
  I: number;
  a: number;
};

// ------------------------------------------------------------
// React.Component<Props, State>
// 你的 props 不需要任何東西，所以用 Record<string, never>
// （代表：不允許有任何 props key）
// ------------------------------------------------------------
export default class AppView extends React.Component<
  Record<string, never>,
  State
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
  constructor(props: Record<string, never>) {
    super(props);

    // 1) 初始化 UI state（slider 顯示用）
    this.state = { I: 20, a: 0.5 };

    // 2) 固定價格（目前 px,py 常數）
    //    你之後如果要價格 slider，就會變成 state + handler + controller.onPriceChange
    const px = 1;
    const py = 1;

    // 3) 建立 Model：把初始參數塞進去
    //    注意：Model 內部自己保存一份 params
    this.model = new ConsumerOptModel({ I: 20, a: 0.5, px, py });

    // 4) 建立 Controller
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
    this.controller = new ConsumerOptController({
      innerW: 520 - 40 - 20,
      innerH: 360 - 20 - 30,
      model: this.model,
    });

    // 5) bind：class component 綁定 this
    //    因為下面會把 handler 當 callback 傳給 onChange / subscribe
    this.handleIncomeChange = this.handleIncomeChange.bind(this);
    this.handleAlphaChange = this.handleAlphaChange.bind(this);
    this.handleAlphaFromController = this.handleAlphaFromController.bind(this);

    // 6) 訂閱 controller：
    //    目的：當 controller/model 因拖曳 opt 點而更新了 a，
    //    AppView 的 slider UI 也要同步更新（否則 slider 會卡在舊值）
    //
    // ⚠️ 重要：你 controller 的 Listener 型別如果是 (scene: SceneOutput) => void，
    //    那這裡訂閱的函式應該接收 scene 參數才一致。
    //
    // 你現在的 handleAlphaFromController() 沒有參數，
    //    有些 TS 設定會允許（因為多的參數不一定要用），
    //    但語意上容易混亂。
    //
    // 建議改成：handleAlphaFromController(scene: SceneOutput) { ... }
    // 或者 Controller 提供另一種 subscribeParamsChanged(listener: () => void)
    this.controller.subscribe(this.handleAlphaFromController);
  }

  // ----------------------------------------------------------
  // componentWillUnmount：元件卸載時解除訂閱
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
    const p = this.model.getParams();
    this.setState({ a: p.a, I: p.I });
  }

  // ----------------------------------------------------------
  // handleIncomeChange：收入 slider 改變
  //
  // 做兩件事：
  // 1) 更新 AppView 的 UI state（讓 slider 顯示正確）
  // 2) 通知 controller：更新 model + rebuild scene + notify view
  // ----------------------------------------------------------
  private handleIncomeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextI = Number(e.target.value);

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
    const nextA = Number(e.target.value);

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
    const px = 1;
    const py = 1;

    return (
      <div style={{ padding: 16 }}>
        <h2>Consumer Optimum (Cobb-Douglas)</h2>

        {/* flex layout：左 slider、右圖 */}
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div>
            {/* Income slider */}
            <div style={{ marginBottom: 12 }}>
              <label>
                Income I: {this.state.I}
                <input
                  type="range"
                  min={5}
                  max={60}
                  value={this.state.I}
                  onChange={this.handleIncomeChange}
                />
              </label>
            </div>

            {/* alpha slider */}
            <div style={{ marginBottom: 12 }}>
              <label>
                a (x exponent): {this.state.a.toFixed(2)}
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.01}
                  value={this.state.a}
                  onChange={this.handleAlphaChange}
                />
              </label>
            </div>

            {/* 顯示價格（目前固定） */}
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              px = {px}, py = {py}
            </div>
          </div>

          {/* GraphView：只需要 controller（因為它會向 controller 訂閱 scene 更新） */}
          <ConsumerOptGraphView controller={this.controller} />
        </div>
      </div>
    );
  }
}
