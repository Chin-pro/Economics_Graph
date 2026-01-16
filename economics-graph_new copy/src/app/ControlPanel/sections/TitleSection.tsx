// src/app/ControlPanel/sections/TitleSection.tsx
// ------------------------------------------------------------
//  Chart title 文字輸入區塊
// ------------------------------------------------------------

import React from "react";
import { LabeledTextInput } from "../ui/LabeledTextInput";
import type { TitleConfig } from "../ControlPanelTypes";

export function TitleSection(props: {
    title: TitleConfig;
    patchTitle: (patch: Partial<TitleConfig>) => void;
}) {
    return (
        <LabeledTextInput
            label="Chart title"
            value={props.title.chartTitle}
            onValueChange={(v) => {
                props.patchTitle({ chartTitle: v });
            }}
        />
    );
}
