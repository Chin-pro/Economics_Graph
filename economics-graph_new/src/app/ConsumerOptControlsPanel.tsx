// src/app/ConsumerOptControlsPanel.tsx

// ------------------------------------------------------------
//  ControlsPanel：純 UI 控制面板
//  - 只負責把 state 渲染成 UI (checkbox、slider、input、select...)
//  - 使用 props 的 callback 把使用這操作回傳給上層
//
//  Scope:
//  - 不 new controller/model
//  - 不處理 scene build
// ------------------------------------------------------------

import React from "react";
import { ControlledSlider } from "../common/ControlledSlider";
import type { ConsumerViewOptions } from "../core/types";

// 允許的 ticks 常數
const ALLOWED_TICKS: number[] = [1, 2, 4, 5, 10];

export type ControlsState = {
    // model parameters
    I: number;
    exponent: number;
    px: number;
    py: number;

    // 坐標軸 / 刻度 UI
    ticks: number;
    showTickLines: boolean;
    showTickLabels: boolean;
    xLabel: string;    // 於 X 軸 顯示的文字
    yLabel: string;    // 於 Y 軸 顯示的文字

    // 圖表標題 UI
    chartTitle: string;          // 標題文字
    showXLabel: boolean;         // 是否顯示 X 標籤
    showYLabel: boolean;         // 是否顯示 Y 標籤

    showChartTitle: boolean;     // 是否顯示標題
    chartTitleFontSize: number;  // 標題字體大小

    exportFileName: string;      // 匯出檔名

    // view options（會同步到 controller，表示 UI 改變會影響圖形渲染）
    // 視覺層 (顏色、方程式字體大小、是否顯示 Opt/Equation labels...)
    viewOptions: ConsumerViewOptions;
};


// ------------------------------------------------------------
//  ConsumerOptControlsPanel (主元件)
//  1. state: ControlsState
//   - Input：控制面板所有顯示都由它決定（典型受控元件模式）
//
//  2. onChangeState(patch)
//   - 通知上層「請把 state 合併 patch」
//   - Input：Partial<ControlsState>，只帶要改的欄位
//   - Output：void（副作用由上層處理，例如 setState + 同步 controller）
//
//  3. onChangeTicks(ticks)
//   - ticks 可能需要上層做「額外行為」（例如：重新算 tick positions 或觸發 scene rebuild）
//     所以獨立一個 handler
//   - Input：ticks（已被驗證在允許範圍內）
//
//  4. onIncomeChange / onAlphaChange / onPxChange / onPyChange
//   - 直接對 model params 做更新（通常會觸發 heavy rebuild）
//   - Input：對應數值
//  
//  5. onViewOptionsChange(patch)
//   - 視覺變更通常走 light patch 或較輕量更新（依你 controller 設計）
//   - Input：只修改 ConsumerViewOptions 的部分欄位
//
//  6. onExportClick()
//   - 觸發匯出 SVG（上層應該拿到目前 scene/svg DOM 然後輸出）
//   - Input：無
// ------------------------------------------------------------
export default function ConsumerOptControlsPanel(props: {
  state: ControlsState;    // 輸入資料: 控制面板所有顯示都由它決定(典型受控元件模式)

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
          value={s.viewOptions.labelFontSize}
          onChange={(next) => props.onViewOptionsChange({ labelFontSize: next })}
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
        value={Number(s.exponent.toFixed(2))}
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
