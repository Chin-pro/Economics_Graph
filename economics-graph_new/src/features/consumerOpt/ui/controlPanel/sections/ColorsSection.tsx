// src/app/controls/sections/ColorsSection.tsx
// ------------------------------------------------------------
// [NEW] 顏色設定區塊（budget/indiff/opt point/opt text）
// ------------------------------------------------------------

import React from "react";
import type { ConsumerViewOptions } from "../../../view/types";
import { UI_TOKENS } from "../ui/Token";

export function ColorsSection(props: {
    viewOptions: ConsumerViewOptions;
    patchViewOptions: (patch: Partial<ConsumerViewOptions>) => void;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: UI_TOKENS.spacing.md }}>
            <div style={{ display: "flex", gap: UI_TOKENS.spacing.lg }}>
                <label style={{ display: "flex", gap: UI_TOKENS.spacing.sm, alignItems: "center" }}>
                    Budget color
                    <input
                        type="color"
                        value={props.viewOptions.budgetColor}
                        onChange={(e) => {
                            props.patchViewOptions({ budgetColor: e.currentTarget.value });
                        }}
                    />
                </label>

                <label style={{ display: "flex", gap: UI_TOKENS.spacing.sm, alignItems: "center" }}>
                    Indiff color
                    <input
                        type="color"
                        value={props.viewOptions.indiffColor}
                        onChange={(e) => {
                            props.patchViewOptions({ indiffColor: e.currentTarget.value });
                        }}
                    />
                </label>
            </div>

            <div style={{ display: "flex", gap: UI_TOKENS.spacing.lg }}>
                <label style={{ display: "flex", gap: UI_TOKENS.spacing.sm, alignItems: "center" }}>
                    Opt point
                    <input
                        type="color"
                        value={props.viewOptions.optPointColor}
                        onChange={(e) => {
                            props.patchViewOptions({ optPointColor: e.currentTarget.value });
                        }}
                    />
                </label>

                <label style={{ display: "flex", gap: UI_TOKENS.spacing.sm, alignItems: "center" }}>
                    Opt text
                    <input
                        type="color"
                        value={props.viewOptions.optTextColor}
                        onChange={(e) => {
                            props.patchViewOptions({ optTextColor: e.currentTarget.value });
                        }}
                    />
                </label>
            </div>
        </div>
    );
}
