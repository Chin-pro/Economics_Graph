// src/app/ControlPanel/sections/ExportSection.tsx

// ------------------------------------------------------------
//  Export 區塊：檔名 + 按鈕
// ------------------------------------------------------------

import React from "react";
import { LabeledTextInput } from "../ui/LabeledTextInput";
import type { ExportConfig } from "../ControlPanelTypes";
import { UI_TOKENS } from "../ControlPanelIndex";

export function ExportSection(props: {
    exportCfg: ExportConfig;
    patchExport: (patch: Partial<ExportConfig>) => void;
    onExportClick: () => void;
}) {
    return (
        <div>
        <LabeledTextInput
            label="Export file name"
            value={props.exportCfg.exportFileName}
            onValueChange={(v) => {
                props.patchExport({ exportFileName: v });
            }}
        />

        <button
            onClick={() => {
                props.onExportClick();
            }}
            style={{ marginTop: UI_TOKENS.spacing.sm }}
        >
            Export SVG
        </button>
        </div>
    );
}
