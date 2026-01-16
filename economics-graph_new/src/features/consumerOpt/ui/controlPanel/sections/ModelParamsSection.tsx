// src/app/controls/sections/ModelParamsSection.tsx
// ------------------------------------------------------------
// [NEW] 經濟模型參數 sliders 區塊（I/a/px/py）
// ------------------------------------------------------------

import React from "react";

import { ControlledSlider } from "../../../../../shared/ControlledSlider";
import type { ModelParams } from "../types";
import { SLIDER_RANGES } from "../ranges";

export function ModelParamsSection(props: {
    model: ModelParams;

    // 仍維持原本的 callbacks（上層可決定 heavy rebuild）
    onIncomeChange: (I: number) => void;
    onAlphaChange: (exponent: number) => void;
    onPxChange: (px: number) => void;
    onPyChange: (py: number) => void;
}) {
    return (
        <div>
            <ControlledSlider
                label="Income I"
                min={SLIDER_RANGES.income.min}     // 5
                max={SLIDER_RANGES.income.max}     // 60
                step={SLIDER_RANGES.income.step}
                value={props.model.I}
                onChange={(nextI) => {
                    props.onIncomeChange(nextI);
                }}
            />

            <ControlledSlider
                label="a (x exponent)"
                min={SLIDER_RANGES.exponent.min}     // 0.1
                max={SLIDER_RANGES.exponent.max}     // 0.9
                step={SLIDER_RANGES.exponent.step}   // 0.01
                // 顯示固定到小數 2 位，避免 UI 抖動
                value={Number(props.model.exponent.toFixed(2))}
                onChange={(nextA) => {
                    props.onAlphaChange(nextA);
                }}
            />

            <ControlledSlider
                label="Price px"
                min={SLIDER_RANGES.price.min}    // 0.1
                max={SLIDER_RANGES.price.max}    // 5
                step={SLIDER_RANGES.price.step}    // 0.1
                value={props.model.px}
                onChange={(nextPx) => {
                    props.onPxChange(nextPx);
                }}
            />

            <ControlledSlider
                label="Price py"
                value={props.model.py}
                min={SLIDER_RANGES.price.min}    // 0.1
                max={SLIDER_RANGES.price.max}    // 5
                step={SLIDER_RANGES.price.step}    // 0.1
                onChange={(nextPy) => {
                    props.onPyChange(nextPy);
                }}
            />
        </div>
    );
}
