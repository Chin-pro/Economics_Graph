// src/app/ControlPanel/sections/VisibilitySection.tsx
// ------------------------------------------------------------
//  Visibility 區塊
//  - 主 panel 的 return 太長 → 拆成 section，讓 SRP 更清楚
// ------------------------------------------------------------

import React from "react";
import { SectionCard } from "../ui/SectionCard";
import { CheckboxRow } from "../ui/CheckboxRow";
import type { AxisLabelConfig, TitleConfig } from "../ControlPanelTypes";
import type { ConsumerViewOptions } from "../../../core/types";

export function VisibilitySection(props: {
    // 需要顯示/更新的 state slices
    axis: AxisLabelConfig;
    title: TitleConfig;
    viewOptions: ConsumerViewOptions;

    // 更新函數（由外層組好，section 只呼叫）
    patchAxis: (patch: Partial<AxisLabelConfig>) => void;
    patchTitle: (patch: Partial<TitleConfig>) => void;
    patchViewOptions: (patch: Partial<ConsumerViewOptions>) => void;
}) {
    return (
        <SectionCard title="Visibility">
        <CheckboxRow
            label="顯示方程式文字標籤"
            checked={props.viewOptions.showEquationLabels}
            onCheckedChange={(v) => {
                props.patchViewOptions({ showEquationLabels: v });
            }}
        />

        <CheckboxRow
            label="顯示 Opt（點 + 文字）"
            checked={props.viewOptions.showOpt}
            onCheckedChange={(v) => {
                props.patchViewOptions({ showOpt: v });
            }}
        />

        <CheckboxRow
            label="顯示 X 軸變數名稱"
            checked={props.axis.showXLabel}
            onCheckedChange={(v) => {
                props.patchAxis({ showXLabel: v });
            }}
        />

        <CheckboxRow
            label="顯示 Y 軸變數名稱"
            checked={props.axis.showYLabel}
            onCheckedChange={(v) => {
                props.patchAxis({ showYLabel: v });
            }}
        />

        <CheckboxRow
            label="顯示圖片標題"
            checked={props.title.showChartTitle}
            marginBottom={0}
            onCheckedChange={(v) => {
                props.patchTitle({ showChartTitle: v });
            }}
        />
        </SectionCard>
    );
}
