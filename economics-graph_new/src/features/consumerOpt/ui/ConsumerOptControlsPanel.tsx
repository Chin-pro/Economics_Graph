// src/app/ConsumerOptControlsPanel.tsx
// ------------------------------------------------------------
// ✅ [CHANGED] ControlsPanel：改為「組裝 Sections 的薄殼」
// 修改原因：
// - 原本 return 太長、重複樣板多（checkbox/input/section style）
// - 業界常用做法：拆成 sections + 共用 UI 元件
// - 讓未來擴充 controls（供給/一般均衡/賽局）只要新增 section 即可
//
// SRP 仍保持：
// - 本檔只負責：
//   1) 接 props/state
//   2) 建立 patch helper（axis/title/tick/export）
//   3) 排版組裝各 section
// - 不 new controller/model
// - 不處理 scene
// ------------------------------------------------------------

import React from "react";

import type { ConsumerViewOptions } from "../view/types";

// 型別集中從 controlsTypes 讀
export type {
    ControlsState,                 // 讓外部（AppView）仍可從這個檔案 import type ControlsState
    ConsumerOptControlsPanelProps, // 若你外部需要 props 型別也能用
} from "./controlPanel";


// 內部用同一份型別，避免漂移
import type {
    ControlsState,
    ConsumerOptControlsPanelProps,
    AxisLabelConfig,
    TitleConfig,
    TickConfig,
    ExportConfig,
} from "./controlPanel";

// 用 Token 統一管理 magic number
import { PANEL_STYLE } from "./controlPanel";

// sections
import { VisibilitySection } from "./controlPanel/sections/VisibilitySection";
import { FontSizesSection } from "./controlPanel/sections/FontSizesSection";
import { TitleSection } from "./controlPanel/sections/TitleSection";
import { ExportSection } from "./controlPanel/sections/ExportSection";
import { AxisLabelsSection } from "./controlPanel/sections/AxisLabelsSection";
import { TicksSection } from "./controlPanel/sections/TicksSection";
import { ColorsSection } from "./controlPanel/sections/ColorsSection";
import { ModelParamsSection } from "./controlPanel/sections/ModelParamsSection";


// // 面板外框 style（集中，避免 JSX 雜訊）
// const PANEL_STYLE: React.CSSProperties = {
//     width: 340,
//     display: "flex",
//     flexDirection: "column",
//     gap: 14,
// };

export function ConsumerOptControlsPanel(props: ConsumerOptControlsPanelProps) {
    // 受控 state（所有 UI 值都從這裡來）
    const s: ControlsState = props.state;

    // ----------------------------------------------------------
    //  patch helpers：把「巢狀 group 的更新」集中起來
    //  - 避免每個 section/checkbox 都寫一大坨 {...s.axis, ...patch}
    //  - 讓 JSX 更接近宣告式 UI
    // ----------------------------------------------------------

    // patchAxis：更新 axis group（傳入部分欄位）
    const patchAxis = (patch: Partial<AxisLabelConfig>) => {
        props.onChangeState({
            axis: {
                ...s.axis,
                ...patch,
            },
        });
    };

    // patchTitle：更新 title group
    const patchTitle = (patch: Partial<TitleConfig>) => {
        props.onChangeState({
            title: {
                ...s.title,
                ...patch,
            },
        });
    };

    // patchTick：更新 tick group
    const patchTick = (patch: Partial<TickConfig>) => {
        props.onChangeState({
            tick: {
                ...s.tick,
                ...patch,
            },
        });
    };

    // patchExport：更新 export group
    const patchExport = (patch: Partial<ExportConfig>) => {
        props.onChangeState({
            export: {
                ...s.export,
                ...patch,
            },
        });
    };

    // patchViewOptions：更新 viewOptions（交給上層同步 controller）
    const patchViewOptions = (patch: Partial<ConsumerViewOptions>) => {
        props.onViewOptionsChange(patch);
    };

    return (
        <div style={PANEL_STYLE}>
            <h3 style={{ margin: 0 }}>Controls Panel</h3>

            <VisibilitySection
                axis={s.axis}
                title={s.title}
                viewOptions={s.viewOptions}
                patchAxis={patchAxis}
                patchTitle={patchTitle}
                patchViewOptions={patchViewOptions}
            />

            <FontSizesSection
                title={s.title}
                viewOptions={s.viewOptions}
                patchTitle={patchTitle}
                patchViewOptions={patchViewOptions}
            />

            <TitleSection
                title={s.title}
                patchTitle={patchTitle}
            />

            <ExportSection
                exportCfg={s.export}
                patchExport={patchExport}
                onExportClick={() => {
                props.onExportClick();
                }}
            />

            <AxisLabelsSection
                axis={s.axis}
                patchAxis={patchAxis}
            />

            <TicksSection
                tick={s.tick}
                setTicks={(ticks) => {
                // ticks 的更新走專用 callback（上層可能有額外行為）
                props.onChangeTicks(ticks);
                }}
                patchTick={patchTick}
            />

            <ColorsSection
                viewOptions={s.viewOptions}
                patchViewOptions={patchViewOptions}
            />

            <ModelParamsSection
                model={s.model}
                onIncomeChange={(nextI) => {
                    props.onIncomeChange(nextI);
                }}
                onAlphaChange={(nextA) => {
                    props.onAlphaChange(nextA);
                }}
                onPxChange={(nextPx) => {
                    props.onPxChange(nextPx);
                }}
                onPyChange={(nextPy) => {
                    props.onPyChange(nextPy);
                }}
            />
        </div>
    );
}
