// src/app/ControlPanel/ui/LabeledTextInput.tsx
// ------------------------------------------------------------
//  通用文字輸入（label + input）
//  - Chart title / Export file name / X-axis label / Y-axis label 重複樣板
// ------------------------------------------------------------

import React from "react";
import { LABEL_STYLE } from "./Token";


export function LabeledTextInput(props: {
    label: string;    // 上方小 label
    value: string;    // 受控值
    onValueChange: (value: string) => void; // 回呼：把 string 往上丟
}) {
    return (
        <div>
            <div style={LABEL_STYLE}>{props.label}</div>
            <input
                value={props.value}
                onChange={(e) => {
                    props.onValueChange(e.currentTarget.value);
                }}
                style={{ width: "100%" }}
            />
        </div>
    );
}
