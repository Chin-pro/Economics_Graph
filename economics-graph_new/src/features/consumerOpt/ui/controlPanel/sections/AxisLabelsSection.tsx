// src/app/controls/sections/AxisLabelsSection.tsx
// ------------------------------------------------------------
// [NEW] X/Y 軸標籤文字輸入
// ------------------------------------------------------------

import React from "react";
import { LabeledTextInput } from "../ui/LabeledTextInput";
import type { AxisLabelConfig } from "../types";
import { UI_TOKENS } from "../ui/Token";

export function AxisLabelsSection(props: {
    axis: AxisLabelConfig;
    patchAxis: (patch: Partial<AxisLabelConfig>) => void;
}) {
    return (
        <div style={{ display: "flex", gap: UI_TOKENS.spacing.md }}>
            <div style={{ flex: 1 }}>
                <LabeledTextInput
                    label="X-axis label"
                    value={props.axis.xLabel}
                    onValueChange={(v) => {
                        props.patchAxis({ xLabel: v });
                    }}
                />
            </div>

            <div style={{ flex: 1 }}>
                <LabeledTextInput
                    label="Y-axis label"
                    value={props.axis.yLabel}
                    onValueChange={(v) => {
                        props.patchAxis({ yLabel: v });
                    }}
                />
            </div>
        </div>
    );
}
