// src/app/controls/sections/TicksSection.tsx
// ------------------------------------------------------------
// [NEW] Ticks 區塊：下拉選單 + 刻度線/文字顯示
// ------------------------------------------------------------

import React from "react";

import { CheckboxRow } from "../ui/CheckboxRow";
import type { TickConfig } from "../types";
import { ALLOWED_TICKS } from "../constants";
import { LABEL_STYLE, UI_TOKENS } from "../ui/Token";

export function TicksSection(props: {
  tick: TickConfig;
    // 兩種更新方式：
    // - setTicks：ticks 是離散值，通常上層可能還要做額外行為（因此用專用 callback）
    // - patchTick：showTickLines/showTickLabels 只需要更新 state
    setTicks: (ticks: number) => void;
    patchTick: (patch: Partial<TickConfig>) => void;
}) {
    return (
        <div>
            <div style={LABEL_STYLE}>Ticks</div>

            <select
                value={props.tick.ticks}
                onChange={(e) => {
                    const raw = Number(e.currentTarget.value);

                    // 防呆：只允許 ALLOWED_TICKS
                    // 不用 break/continue，用 ok flag + while
                    let ok = false;
                    let i = 0;
                    while (i < ALLOWED_TICKS.length) {
                        if (ALLOWED_TICKS[i] === raw) { ok = true; }
                        i += 1;
                    }

                    if (ok) {
                        props.setTicks(raw);
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

            <div style={{ 
                marginTop: UI_TOKENS.spacing.sm, 
                display: "flex", 
                flexDirection: "column", 
                gap: UI_TOKENS.spacing.xs 
            }}>
                <CheckboxRow
                    label="顯示刻度線"
                    checked={props.tick.showTickLines}
                    marginBottom={0}
                    onCheckedChange={(v) => {
                        props.patchTick({ showTickLines: v });
                    }}
                />

                <CheckboxRow
                    label="顯示刻度文字"
                    checked={props.tick.showTickLabels}
                    marginBottom={0}
                    onCheckedChange={(v) => {
                        props.patchTick({ showTickLabels: v });
                    }}
                />
            </div>
        </div>
    );
}
