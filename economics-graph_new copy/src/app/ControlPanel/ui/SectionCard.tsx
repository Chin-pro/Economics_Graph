// src/app/ControlPanel/ui/SectionCard.tsx
// ------------------------------------------------------------
//  通用「卡片區塊」容器
//  - 有大量重複的 style（padding/border/radius）
//  - 用一個元件統一視覺與結構，讓 JSX 更乾淨
// ------------------------------------------------------------

import React from "react";
import { UI_TOKENS } from "./Token";


// 區塊外框的 style（集中管理，避免 JSX 雜訊）
const CARD_STYLE: React.CSSProperties = {
    padding: UI_TOKENS.sectionCard.padding,
    border: `${UI_TOKENS.sectionCard.borderWidth}px solid ${UI_TOKENS.sectionCard.borderColor}`,
    borderRadius: UI_TOKENS.sectionCard.borderRadius,
};

// 標題 style
const TITLE_STYLE: React.CSSProperties = {
    fontWeight: UI_TOKENS.sectionCard.titleFontWeight,
    marginBottom: UI_TOKENS.sectionCard.titleMarginBottom,
};

export function SectionCard(props: {
  title: string;          // 區塊標題（例如 Visibility / Font sizes）
  children: React.ReactNode; // 區塊內容
}) {
    return (
        <div style={CARD_STYLE}>
            <div style={TITLE_STYLE}>{props.title}</div>
            {props.children}
        </div>
    );
}
