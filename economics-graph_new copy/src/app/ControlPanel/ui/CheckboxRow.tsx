// src/app/ControlPanel/ui/CheckboxRow.tsx
// ------------------------------------------------------------
//  通用 checkbox row
//  - 有大量重複的 <label><input type="checkbox" ... /></label>
//  - 抽成元件後，Section 的 JSX 會短很多，且一致性更好
// ------------------------------------------------------------

import React from "react";
import { UI_TOKENS } from "./Token";


export function CheckboxRow(props: {
    label: string;                                // 顯示文字
    checked: boolean;                             // 受控值
    onCheckedChange: (checked: boolean) => void;  // 回呼：把 boolean 往上丟
    marginBottom?: number;                        // 可選：下方間距
}) {
    // 預設 marginBottom（不用 ternary；用 if 決定）
    let marginBottom: number = UI_TOKENS.spacing.xs;

    if (typeof props.marginBottom === "number") {
        marginBottom = props.marginBottom;
    }

    return (
        <label style={{ display: "block", marginBottom: marginBottom }}>
        <input
            type="checkbox"
            checked={props.checked}
            onChange={(e) => {
                props.onCheckedChange(e.currentTarget.checked);
            }}
        />
        {" "}{props.label}
        </label>
    );
}
