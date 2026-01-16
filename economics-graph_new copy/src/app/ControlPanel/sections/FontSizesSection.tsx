// src/app/ControlPanel/sections/FontSizesSection.tsx

// ------------------------------------------------------------
//  Font sizes 區塊
// ------------------------------------------------------------

import React from "react";
import { SectionCard } from "../ui/SectionCard";
import { ControlledSlider } from "../../../common/ControlledSlider";
import type { TitleConfig } from "../ControlPanelTypes";
import type { ConsumerViewOptions } from "../../../core/types";
import { SLIDER_RANGES } from "../SliderRanges";

export function FontSizesSection(props: {
    title: TitleConfig;
    viewOptions: ConsumerViewOptions;

    patchTitle: (patch: Partial<TitleConfig>) => void;
    patchViewOptions: (patch: Partial<ConsumerViewOptions>) => void;
}) {
    return (
        <SectionCard title="Font sizes">
        <ControlledSlider
            label="Equation label font"
            min={SLIDER_RANGES.equationFont.min}      // 8
            max={SLIDER_RANGES.equationFont.max}      // 24
            step={SLIDER_RANGES.equationFont.step}    // 1
            value={props.viewOptions.labelFontSize}
            onChange={(next) => {
                props.patchViewOptions({ labelFontSize: next });
            }}
        />

        <ControlledSlider
            label="Title font"
            min={SLIDER_RANGES.titleFont.min}      // 10
            max={SLIDER_RANGES.titleFont.max}      // 26
            step={SLIDER_RANGES.titleFont.step}    // 1
            value={props.title.chartTitleFontSize}
            onChange={(next) => {
                props.patchTitle({ chartTitleFontSize: next });
            }}
        />
        </SectionCard>
    );
}
