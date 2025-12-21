// src/app/AppView.tsx
import React from "react";
import { ConsumerOptModel } from "../MVC/model/ConsumerOptModel";
import { ConsumerOptController } from "../MVC/controller/ConsumerOptController";
import { ConsumerOptGraphView } from "../MVC/view/ConsumerOptGraphView";

type State = {
  I: number;
  a: number;
};

export default class AppView extends React.Component<Record<string, never>, State> {
  private controller: ConsumerOptController;
  private model: ConsumerOptModel;

  constructor(props: Record<string, never>) {
    super(props);

    this.state = { I: 20, a: 0.5 };

    const px = 1;
    const py = 1;

    this.model = new ConsumerOptModel({ I: 20, a: 0.5, px, py });

    // 這裡只是先固定 innerW/innerH，真正 SVG 外框在 GraphView 管
    this.controller = new ConsumerOptController({
      innerW: 520 - 40 - 20,
      innerH: 360 - 20 - 30,
      model: this.model,
    });

    this.handleIncomeChange = this.handleIncomeChange.bind(this);
    this.handleAlphaChange = this.handleAlphaChange.bind(this);
    this.handleAlphaFromController = this.handleAlphaFromController.bind(this);

    // controller 更新時，我們同步把 a 寫回 App state（維持 slider UI 同步）
    this.controller.subscribe(this.handleAlphaFromController);
  }

  componentWillUnmount() {
    this.controller.unsubscribe(this.handleAlphaFromController);
  }

  private handleAlphaFromController() {
    // controller/model 內部可能因拖曳而更新 a，因此要同步到 UI
    const p = this.model.getParams();
    this.setState({ a: p.a, I: p.I });
  }

  private handleIncomeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextI = Number(e.target.value);
    this.setState({ I: nextI });
    this.controller.onIncomeChange(nextI);
  }

  private handleAlphaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextA = Number(e.target.value);
    this.setState({ a: nextA });
    this.controller.onAlphaChange(nextA);
  }

  render() {
    const px = 1;
    const py = 1;

    return (
      <div style={{ padding: 16 }}>
        <h2>Consumer Optimum (Cobb-Douglas)</h2>

        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div>
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

            <div style={{ fontSize: 12, opacity: 0.8 }}>
              px = {px}, py = {py}
            </div>
          </div>

          <ConsumerOptGraphView controller={this.controller} />
        </div>
      </div>
    );
  }
}
