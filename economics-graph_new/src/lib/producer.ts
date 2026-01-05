// src/app/ConsumerOptControlsPanel.tsx
// ------------------------------------------------------------
// ✅ [NEW] ControlsPanel：純 UI（SRP）
// - 不 new controller/model
// - 不處理 scene
// - 只用 props 收值、回呼
// ------------------------------------------------------------

import React from "react";
import { ControlledSlider } from "../common/ControlledSlider";
import type { ConsumerViewOptions } from "../MVC/controller/types";

const ALLOWED_TICKS: number[] = [1, 2, 4, 5, 10];

export type ControlsState = {
  I: number;
  a: number;
  px: number;
  py: number;

  ticks: number;
  showTickLines: boolean;
  showTickLabels: boolean;

  xLabel: string;
  yLabel: string;

  chartTitle: string;
  showXLabel: boolean;
  showYLabel: boolean;

  showChartTitle: boolean;
  chartTitleFontSize: number;

  exportFileName: string;

  // view options（會同步到 controller）
  viewOptions: ConsumerViewOptions;
};

export function ConsumerOptControlsPanel(props: {
  state: ControlsState;

  onChangeState: (patch: Partial<ControlsState>) => void;

  onChangeTicks: (ticks: number) => void;

  // model params
  onIncomeChange: (I: number) => void;
  onAlphaChange: (a: number) => void;
  onPxChange: (px: number) => void;
  onPyChange: (py: number) => void;

  // view options
  onViewOptionsChange: (patch: Partial<ConsumerViewOptions>) => void;

  onExportClick: () => void;
}) {
  const s = props.state;

  return (
    <div style={{ width: 340, display: "flex", flexDirection: "column", gap: 14 }}>
      <h3 style={{ margin: 0 }}>Controls Panel</h3>

      <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Visibility</div>

        <label style={{ display: "block", marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={s.viewOptions.showEquationLabels}
            onChange={(e) => props.onViewOptionsChange({ showEquationLabels: e.currentTarget.checked })}
          />
          {" "}顯示方程式文字標籤
        </label>

        <label style={{ display: "block", marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={s.viewOptions.showOpt}
            onChange={(e) => props.onViewOptionsChange({ showOpt: e.currentTarget.checked })}
          />
          {" "}顯示 Opt（點 + 文字）
        </label>

        <label style={{ display: "block", marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={s.showXLabel}
            onChange={(e) => props.onChangeState({ showXLabel: e.currentTarget.checked })}
          />
          {" "}顯示 X 軸變數名稱
        </label>

        <label style={{ display: "block", marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={s.showYLabel}
            onChange={(e) => props.onChangeState({ showYLabel: e.currentTarget.checked })}
          />
          {" "}顯示 Y 軸變數名稱
        </label>

        <label style={{ display: "block" }}>
          <input
            type="checkbox"
            checked={s.showChartTitle}
            onChange={(e) => props.onChangeState({ showChartTitle: e.currentTarget.checked })}
          />
          {" "}顯示圖片標題
        </label>
      </div>

      <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Font sizes</div>

        <ControlledSlider
          label="Equation label font"
          min={8}
          max={24}
          step={1}
          value={s.viewOptions.equationFontSize}
          onChange={(next) => props.onViewOptionsChange({ equationFontSize: next })}
        />

        <ControlledSlider
          label="Title font"
          min={10}
          max={26}
          step={1}
          value={s.chartTitleFontSize}
          onChange={(next) => props.onChangeState({ chartTitleFontSize: next })}
        />
      </div>

      <div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Chart title</div>
        <input
          value={s.chartTitle}
          onChange={(e) => props.onChangeState({ chartTitle: e.currentTarget.value })}
          style={{ width: "100%" }}
        />
      </div>

      <div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Export file name</div>
        <input
          value={s.exportFileName}
          onChange={(e) => props.onChangeState({ exportFileName: e.currentTarget.value })}
          style={{ width: "100%" }}
        />
        <button onClick={props.onExportClick} style={{ marginTop: 8 }}>
          Export SVG
        </button>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>X-axis label</div>
          <input
            value={s.xLabel}
            onChange={(e) => props.onChangeState({ xLabel: e.currentTarget.value })}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Y-axis label</div>
          <input
            value={s.yLabel}
            onChange={(e) => props.onChangeState({ yLabel: e.currentTarget.value })}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* ticks */}
      <div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Ticks</div>
        <select
          value={s.ticks}
          onChange={(e) => {
            const raw = Number(e.currentTarget.value);

            let ok = false;
            let i = 0;
            while (i < ALLOWED_TICKS.length) {
              if (ALLOWED_TICKS[i] === raw) {
                ok = true;
              }
              i += 1;
            }

            if (ok) {
              props.onChangeTicks(raw);
            }
          }}
          style={{ width: "100%" }}
        >
          {ALLOWED_TICKS.map((v) => (
            <option key={"ticks-" + v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <label>
            <input
              type="checkbox"
              checked={s.showTickLines}
              onChange={(e) => props.onChangeState({ showTickLines: e.currentTarget.checked })}
            />
            顯示刻度線
          </label>

          <label>
            <input
              type="checkbox"
              checked={s.showTickLabels}
              onChange={(e) => props.onChangeState({ showTickLabels: e.currentTarget.checked })}
            />
            顯示刻度文字
          </label>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Budget color
          <input
            type="color"
            value={s.viewOptions.budgetColor}
            onChange={(e) => props.onViewOptionsChange({ budgetColor: e.currentTarget.value })}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Indiff color
          <input
            type="color"
            value={s.viewOptions.indiffColor}
            onChange={(e) => props.onViewOptionsChange({ indiffColor: e.currentTarget.value })}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Opt point
          <input
            type="color"
            value={s.viewOptions.optPointColor}
            onChange={(e) => props.onViewOptionsChange({ optPointColor: e.currentTarget.value })}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Opt text
          <input
            type="color"
            value={s.viewOptions.optTextColor}
            onChange={(e) => props.onViewOptionsChange({ optTextColor: e.currentTarget.value })}
          />
        </label>
      </div>

      <ControlledSlider
        label="Income I"
        min={5}
        max={60}
        value={s.I}
        onChange={(nextI) => props.onIncomeChange(nextI)}
      />

      <ControlledSlider
        label="a (x exponent)"
        min={0.1}
        max={0.9}
        step={0.01}
        value={Number(s.a.toFixed(2))}
        onChange={(nextA) => props.onAlphaChange(nextA)}
      />

      <ControlledSlider
        label="Price px"
        value={s.px}
        min={0.1}
        max={5}
        step={0.1}
        onChange={(nextPx) => props.onPxChange(nextPx)}
      />

      <ControlledSlider
        label="Price py"
        value={s.py}
        min={0.1}
        max={5}
        step={0.1}
        onChange={(nextPy) => props.onPyChange(nextPy)}
      />
    </div>
  );
}
