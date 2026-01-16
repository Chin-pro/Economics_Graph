/* drawable.ts */

// ------------------------------------------------------------
//  定義 drawables 的資料格式 (line/point/text/...)
//  - 通用「可畫圖元」：完全不依賴 React / SVG / Canvas，只需要遵守同一份 Drawable 規格
//
//  - renderer（SvgSceneView）會把 Drawable 轉成真正 SVG 元素
//  - 它不綁任何渲染技術 (React/SVG/Canvas)，所以:
//    - 可以用 SVG renderer
//    - 可以用 Canvas renderer
//    - 可以用 WebGL ...
//
//  - 保持「對外」型別彈性: 依然存在可選屬性
//  - 提供「對內」型別要求 Resolved 型別: 給 builder normalize 後使用
//    - 
// ------------------------------------------------------------


// 定義一個 二維向量 / 座標
export type Vec2 = { x: number; y: number };
export type Point2D = Vec2;

// 線條樣式 Strict StrokeStyle
export type StrokeStyle = {
    width: number;      // 線寬 (pixel)
    dash: number[];     // 虛線樣式 (SVG stroke-dasharray)
    color: string;      // 顏色 (hex / rgb / css color)
};

// 填滿樣式 Strict FillStyle
export type FillStyle = {
    color: string;    // 顏色 (hex / rgb / css color)
};

// TextSpan  Strict TextSpan
// - 用於 <tspan> (支援 baseline-shift 上/下標)
export type TextSpan = {
    text: string;          // span 文字內容

    offsetDx: number;     // 相對位移 x (預設 0)
    offsetDy: number;     // 相對位移 x (預設 0)
    
    baselineShift: "sub" | "super" | number;  // 基線偏移 (預設 0)
    
    fontSize: number;     // 字體大小 (預設會跟隨 parent fonsSize)
    fontStyle: string;    // 字體樣式 (預設 "normal")
    fontWeight: string;   // 字重 (預設 "normal")

    kind: "normal" | "sup" | "sub";    // 語意類型 (預設 "normal")
};

// ============================================================
//  Strict（對內必填）Drawable 型別
//  - stroke/fill/... 全必填，renderer/controller 就不需要 ?. / if
// ============================================================
// 線段
export type LineDrawable = {
    kind: "line";            // 辨識標籤，告訴 renderer，這筆資料是一條線 (renderer 會 透過 switch (d.kind) 決定怎麼畫)
    id: string;              // 唯一識別 (Ex: budget)
    minEndPoint: Point2D;    // 線段端點 (像素座標)
    maxEndPoint: Point2D;
    stroke: StrokeStyle;     // 可選線條樣式
};

// 折線 (點列)
export type PolylineDrawable = {
    kind: "polyline";        // 折線
    id: string;
    points: Point2D[];          // 很多點串起來 (Ex: 無意曲線的取樣點)
    stroke: StrokeStyle;    // 線條樣式 (通常無異曲線也是線)
};

// 點 (通常化成圓)
export type PointDrawable = {
    kind: "point";           // 表示「點」
    id: string;
    center: Point2D;         // 點的位置 (圓心)
    r: number;               // 半徑
    fill: FillStyle;         // 填色
    stroke: StrokeStyle;     // 圓的外框
};

// 文字
export type TextDrawable = {
    kind: "text";            // 文字 drawable
    id: string;
    pos: Point2D;               // 文字的定位點 (SVG <text x= y=> 的那個座標)

    text: string;            // 要顯示的文字內容，作為 fallback / debug / hit-test fallback (???)
    spans: TextSpan[];       // spans: 若提供，就用 <tspan> 畫出類似 LaText 效果

    fontSize: number;        // 可選字體大小
    fill: FillStyle;         // 文字顏色 (可以跟預算線同色)
    draggable: boolean;      // 文字是否可以拖曳 (方程式標籤用)
    textAnchor: "start" | "middle" | "end";  // 置左/置中/置右
};

// ------------------------------------------------------------
// MathSvgDrawable
// - latex: 要渲染的 LaTeX
// - fontSize: 期刊化時仍需要控制相對大小（最後會用 scale 映射到 SVG）
// - color: 用 fill color 控制（MathJax SVG 主要是 path fill）
// - draggable: 讓方程式標籤可以拖曳
// - displayMode: true 會用 display math（更大更像獨立方程式）；false 是 inline
// ------------------------------------------------------------
export type MathSvgDrawable = {
    kind: "mathSvg";
    id: string;             // 唯一識別
    pos: Point2D;           // 定位點
    latex: string;          // LaTeX 原文

    fontSize: number;
    fill: FillStyle;
    draggable: boolean;
    displayMode: boolean;
};

// union type: Drawable 可以是以下5種其中之一
export type Drawable =
    | LineDrawable
    | PolylineDrawable
    | PointDrawable
    | TextDrawable
    | MathSvgDrawable;

// ------------------------------------------------------------
//  SceneOutput: renderer 唯一需要的輸入 (核心必填)
// ------------------------------------------------------------
export type SceneOutput = {
    width: number;            // 畫布高
    height: number;           // 畫布寬
    drawables: Drawable[];    // 內部永遠是完整 Drawable

    // 讓外部也知道這張圖的經濟座標範圍，Ex: [0, xMax]、[0, xMin] ??? 是否還需要向外部公開???
    xDomain: [number, number];  // 經濟座標 x 範圍
    yDomain: [number, number];  // 經濟座標 y 範圍
};


// ============================================================
//  Input types: 允許可選 (給 bulder / 外部產資料用)
// ============================================================

// ------------------------------------------------------------
//  StrokeStyleInput: 允許 partial (只填充想覆蓋的欄位)
// ------------------------------------------------------------
export type StrokeStyleInput = {
    width?: number;        // 可選: 沒給就用 default
    dash?: number[];       // 可選: 沒給就用 default[]
    color?: string;        // 可選: 沒給就用 default
}

// ------------------------------------------------------------
//  FillStyleInput: 允許 partial
// ------------------------------------------------------------
export type FillStyleInput = {
    color?: string;        // 可選: 沒給就用 default
}

// ------------------------------------------------------------
//  TextSpanInput: 允許 partial (text 必填，其他可選)
// ------------------------------------------------------------
export type TextSpanInput = {
    text: string;  // 仍然必填 (沒有 text 就不是 span)

    offsetDx?: number;
    offsetDy?: number;

    baselineShift?: "sub" | "super" | number;

    fontSize?: number;
    fontStyle?: string;
    fontWeight?: string;

    kind?: "normal" | "sup" | "sub";
}

// ------------------------------------------------------------
//  LineDrawableInput：stroke 可選
// ------------------------------------------------------------
export type LineDrawableInput = {
    kind: "line";
    id: string;
    minEndPoint: Point2D;
    maxEndPoint: Point2D;
    stroke?: StrokeStyleInput;
};

// ------------------------------------------------------------
//  PolylineDrawableInput：stroke 可選
// ------------------------------------------------------------
export type PolylineDrawableInput = {
    kind: "polyline";
    id: string;
    points: Point2D[];
    stroke?: StrokeStyleInput;
};

// ------------------------------------------------------------
//  PointDrawableInput：fill/stroke 可選
// ------------------------------------------------------------
export type PointDrawableInput = {
    kind: "point";
    id: string;
    center: Point2D;
    r: number;
    fill?: FillStyleInput;
    stroke?: StrokeStyleInput;
};

// ------------------------------------------------------------
//  TextDrawableInput：多數欄位可選（resolver 補齊）
// ------------------------------------------------------------
export type TextDrawableInput = {
    kind: "text";
    id: string;
    pos: Point2D;

    text: string;
    spans?: TextSpanInput[];

    fontSize?: number;
    fill?: FillStyleInput;
    draggable?: boolean;
    textAnchor?: "start" | "middle" | "end";
};

// ------------------------------------------------------------
//  MathSvgDrawableInput：多數欄位可選（resolver 補齊）
// ------------------------------------------------------------
export type MathSvgDrawableInput = {
    kind: "mathSvg";
    id: string;
    pos: Point2D;
    latex: string;

    fontSize?: number;
    fill?: FillStyleInput;
    draggable?: boolean;
    displayMode?: boolean;
};

// ------------------------------------------------------------
//  union: DrawableInput (給 builder 產資料用)
// ------------------------------------------------------------
export type DrawableInput = 
    | LineDrawableInput
    | PolylineDrawableInput
    | PointDrawableInput
    | TextDrawableInput
    | MathSvgDrawableInput;

// ------------------------------------------------------------
//  SceneOutput_INPUT: drawables 用 DrawableInput[]
// ------------------------------------------------------------
export type SceneOutput_Input = {
    width: number;
    height: number;
    drawables: DrawableInput[];
    xDomain: [number, number];
    yDomain: [number, number];
};


// ============================================================
//  Resolver：單一入口，一次補齊所有預設值 (輸出 strict)
// ============================================================

// ------------------------------------------------------------
//  Default constants (集中管理 Magic number)
// ------------------------------------------------------------
const DEFAULT_STROKE_WIDTH: number = 2;             // 預設線寬
const DEFAULT_STROKE_COLOR: string = "#111111";   // 預設線段顏色
const DEFAULT_FILL_COLOR: string = "#111111";     // 預設填色

const DEFAULT_TEXT_FONT_SIZE: number = 12;          // 預設文字字號
const DEFAULT_TEXT_ANCHOR: "start" | "middle" | "end" = "start";    // 預設對齊
const DEFAULT_DRAGGABLE: boolean = false;           // 預設不可拖曳
const DEFAULT_DISPLAY_MODE: boolean = false;       // 預設 inline math

const DEFAULT_SPAN_FONT_STYLE: string = "normal";   // span 預設 font-style
const DEFAULT_SPAN_FONT_WEIGHT: string = "normal";  // span 預設 font-weight

// ------------------------------------------------------------
//  resolveSceneOutput
//  
//  Input: SceneOutputInput
//  
//  Output: SceneOutput (Strict: 全部必填)
// ------------------------------------------------------------
export function resolveSceneOutput(input: SceneOutput_Input): SceneOutput {
    // 建立 strict drawables 容器 (輸出必填版)
    const resolvedDrawables: Drawable[] = [];

    // 走訪 input.drawables
    let drawableIdx = 0;
    while (drawableIdx < input.drawables.length) {
        const drawableItem = input.drawables[drawableIdx];

        // 逐個 drawable normalize
        // resolveDrawable 回傳 Strict Drawable
        resolvedDrawables.push(resolveDrawable(drawableItem));

        drawableIdx++;
    }

    // 回傳 strict Scene
    return {
        width: input.width,
        height: input.height,
        drawables: resolvedDrawables,
        xDomain: [input.xDomain[0], input.xDomain[1]],
        yDomain: [input.yDomain[0], input.yDomain[1]],
    };
}

// ------------------------------------------------------------
//  resolveDrawable: DrawableInput → Drawable（Strict）
//  - 明確標註回傳型別 Drawable
//  - exhaustive narrowing: 每個 kind 都有明確分支，最後 throw
// ------------------------------------------------------------
function resolveDrawable(drawableInputType: DrawableInput): Drawable {
    // ------------------------------------------------------------
    //  line
    // ------------------------------------------------------------
    if (drawableInputType.kind === "line") {
        return {
            kind: "line",
            id: drawableInputType.id,

            minEndPoint: { 
                x: drawableInputType.minEndPoint.x, 
                y: drawableInputType.minEndPoint.y 
            },
            maxEndPoint: {
                x: drawableInputType.maxEndPoint.x,
                y: drawableInputType.maxEndPoint.y,
            },
            stroke: resolveStrokeStyle(drawableInputType.stroke),
        };
    }

    // ------------------------------------------------------------
    //  polyline
    // ------------------------------------------------------------
    if (drawableInputType.kind === "polyline") {
        const resolvedPoints: Point2D[] = [];

        let pointIdx = 0;
        while (pointIdx < drawableInputType.points.length) {
            const point = drawableInputType.points[pointIdx];
            
            // ??????
            resolvedPoints.push({ x: point.x, y: point.y });

            pointIdx++;
        }

        return {
            kind: "polyline",
            id: drawableInputType.id,
            points: resolvedPoints,
            stroke: resolveStrokeStyle(drawableInputType.stroke),
        };
    }

    // ------------------------------------------------------------
    //  point
    // ------------------------------------------------------------
    if (drawableInputType.kind === "point") {
        return {
            kind: "point",
            id: drawableInputType.id,
            center: { 
                x: drawableInputType.center.x, 
                y: drawableInputType.center.y 
            },
            r: drawableInputType.r,
            fill: resolveFillStyle(drawableInputType.fill),
            stroke: resolveStrokeStyle(drawableInputType.stroke),
        };
    }

    // ------------------------------------------------------------
    //  text
    // ------------------------------------------------------------
    if (drawableInputType.kind === "text") {
        const spansResolved: TextSpan[] = [];

        if (drawableInputType.spans) {
            let spanIdx = 0;
            while (spanIdx < drawableInputType.spans.length) {
                spansResolved.push(resolveTextSpan(drawableInputType.spans[spanIdx]));
                spanIdx++;
            }
        }

        // fontSize: 
        const fontSize = resolveNumberWithDefault(
            drawableInputType.fontSize, 
            DEFAULT_TEXT_FONT_SIZE
        );
        
        // fill: 
        const fill = resolveFillStyle(drawableInputType.fill);
        
        // draggable: 
        const draggable = resolveBooleanWithDefault(
            drawableInputType.draggable, 
            DEFAULT_DRAGGABLE);
        
        // textAnchor: 
        const textAnchor = resolveTextAnchorWithDefault(
            drawableInputType.textAnchor, 
            DEFAULT_TEXT_ANCHOR
        );

        return {
            kind: "text",
            id: drawableInputType.id,

            pos: { 
                x: drawableInputType.pos.x, 
                y: drawableInputType.pos.y 
            },

            text: drawableInputType.text,
            spans: spansResolved,

            fontSize: fontSize,
            fill: fill,
            draggable: draggable,
            textAnchor: textAnchor,
        };
    }
    
    // 明確處理 mathSvg 分支
    if (drawableInputType.kind === "mathSvg") {
        // fontSize:
        const fontSize = resolveNumberWithDefault(
            drawableInputType.fontSize, 
            DEFAULT_TEXT_FONT_SIZE
        );
        
        // fill: 
        const fill = resolveFillStyle(drawableInputType.fill);

        // draggable: 
        const draggable = resolveBooleanWithDefault(
            drawableInputType.draggable, 
            DEFAULT_DRAGGABLE
        );

        // displayMode: 
        const displayMode = resolveBooleanWithDefault(
            drawableInputType.displayMode, 
            DEFAULT_DISPLAY_MODE
        );

        return {
            kind: "mathSvg",
            id: drawableInputType.id,

            pos: { 
                x: drawableInputType.pos.x, 
                y: drawableInputType.pos.y 
            },
            
            latex: drawableInputType.latex,

            fontSize: fontSize,
            fill: fill,
            draggable: draggable,
            displayMode: displayMode,
        };
    }

    // 若未來新增 kind，但漏寫分支 → fail-fast
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error("[resolveDrawable] Unknown drawable kind: " + (drawableInputType as any).kind);
}


// ------------------------------------------------------------
//  resolveStrokeStyle：StrokeStyleInput? → StrokeStyle（Strict）
//  - [CHANGED] 預設 dash 不共用同一個 array instance，避免 cache 汙染風險
// ------------------------------------------------------------
function resolveStrokeStyle(stroke: StrokeStyleInput | undefined): StrokeStyle {
    // default
    const defaultDash: number[] = []

    // width
    let width = DEFAULT_STROKE_WIDTH;
    if (stroke && typeof stroke.width === "number") {
        width = stroke.width;
    }

    // color
    let color = DEFAULT_STROKE_COLOR;
    if (stroke && typeof stroke.color === "string") {
        color = stroke.color;
    }

    // 有 dash (要 clone，避免外部改 array 影響內部)
    // 無 dash → clone，避免外部 mutate 汙染內部
    let dash: number[] = defaultDash;
    if (stroke && Array.isArray(stroke.dash)) {
        dash = stroke.dash.slice();    // clone，避免外部改動汙染內部
    }
    
    return {
        width: width,
        dash: dash,
        color: color,
    };
}

// ------------------------------------------------------------
//  resolveFillStyle：FillStyleInput? → FillStyle（Strict）
// ------------------------------------------------------------
function resolveFillStyle(fill: FillStyleInput | undefined): FillStyle {
    let color = DEFAULT_FILL_COLOR;

    if (fill && typeof fill.color === "string") {
        color = fill.color;
    }

    return {
        color: color,
    }
}


// ------------------------------------------------------------
//  resolveTextSpan：TextSpanInput → TextSpan（Strict）
// ------------------------------------------------------------
function resolveTextSpan(span: TextSpanInput): TextSpan {
    const offsetDx = resolveNumberWithDefault(span.offsetDx, 0);
    const offsetDy = resolveNumberWithDefault(span.offsetDy, 0);

    const baselineShift = resolveBaselineShiftWithDefault(span.baselineShift, 0);

    const fontSize = resolveNumberWithDefault(span.fontSize, DEFAULT_TEXT_FONT_SIZE);
    const fontStyle = resolveStringWithDefault(span.fontStyle, DEFAULT_SPAN_FONT_STYLE);
    const fontWeight = resolveStringWithDefault(span.fontWeight, DEFAULT_SPAN_FONT_WEIGHT);

    const kind = resolveSpanKindWithDefault(span.kind, "normal");

    return {
        text: span.text,
        offsetDx: offsetDx,
        offsetDy: offsetDy,
        baselineShift: baselineShift,
        fontSize: fontSize,
        fontStyle: fontStyle,
        fontWeight: fontWeight,
        kind: kind,
    };
}

// ============================================================
//  小型 resolve helpers（集中處理型別與預設值）
//  - 這些不是「每個可選屬性一個函式」的維護地獄
//  - 它們是共用的 primitive resolver（可重用）
// ============================================================

function resolveNumberWithDefault(v: number | undefined, defaultValue: number): number {
    if (typeof v === "number") {
        return v;
    }
    return defaultValue;
}

function resolveBooleanWithDefault(v: boolean | undefined, defaultValue: boolean): boolean {
    if (typeof v === "boolean") {
        return v;
    }
    return defaultValue;
}

function resolveStringWithDefault(v: string | undefined, defaultValue: string): string {
    if (typeof v === "string") {
        return v;
    }
    return defaultValue;
}

function resolveBaselineShiftWithDefault(
    v: "sub" | "super" | number | undefined,
    defaultValue: number,
): "sub" | "super" | number {
    if (v === "sub") {
        return "sub";
    }
    if (v === "super") {
        return "super";
    }
    if (typeof v === "number") {
        return v;
    }
    return defaultValue;
}

function resolveSpanKindWithDefault(
    v: "normal" | "sup" | "sub" | undefined,
    defaultValue: "normal" | "sup" | "sub",
): "normal" | "sup" | "sub" {
    if (v === "normal") {
        return "normal";
    }
    if (v === "sup") {
        return "sup";
    }
    if (v === "sub") {
        return "sub";
    }
    return defaultValue;
}

function resolveTextAnchorWithDefault(
    v: "start" | "middle" | "end" | undefined,
    defaultValue: "start" | "middle" | "end",
): "start" | "middle" | "end" {
    if (v === "start") {
        return "start";
    }
    if (v === "middle") {
        return "middle";
    }
    if (v === "end") {
        return "end";
    }
    return defaultValue;
}
