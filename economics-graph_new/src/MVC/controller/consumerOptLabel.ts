// src/MVC/controller/consumerOptLabel.ts

// ------------------------------------------------------------
//  Label anchor / offset / clamp
//  - 把「可拖曳標籤」的幾何規則獨立出來
//  
// ------------------------------------------------------------

import type { 
    Drawable, 
    Point2D,
    LineDrawable,
    PolylineDrawable,
    PointDrawable,
    TextDrawable,
    MathSvgDrawable, 
} from "../../core/drawables";

// ------------------------------------------------------------
// PlotArea：clamp 規則需要的「畫布環境參數」
// ------------------------------------------------------------
export type PlotArea = {
    width: number;    // plot area 寬（pixel）
    height: number;   // plot area 高（pixel）
    padding: number;  // 邊界留白（pixel）
};

// ------------------------------------------------------------
// PixelPoint（像素座標點）
// - 直接使用 Vec2（{x,y}），避免與 TextDrawable.pos 的型別不一致
// - Vec2 在 drawables.ts 中定義：{ x: number; y: number }
// - 表「像素座標」只是一種語意，不需要用不同欄位名來區分
// ------------------------------------------------------------
export type PixelPoint = Point2D;

// ------------------------------------------------------------
// PixelOffset（拖曳後偏移）
// - User 拖曳 label 後，label 相對於 anchor 的像素偏移量
// - offsetDx/offsetDy 表示「相對 anchor」的偏移量（像素）
// - 使 label 可以跟著圖形（anchor）移動，但仍保留使用者調整後的相對位置
// ------------------------------------------------------------
export type PixelOffset = { offsetDx: number; offsetDy: number };


// ------------------------------------------------------------
//  LABEL_KEYS: LabelKey 的 single source of truth
//  - 新增 label 只需要改這個陣列，不需要到處修改 union/guard/set
// ------------------------------------------------------------
export const LABEL_KEYS = [
  "budget-eq",
  "indiff-eq",
  "opt-label",
  "utility-eq",
] as const;

// ------------------------------------------------------------
//  LabelKey
//  - 由 LABEL_KEYS 推導
//  - 避免 union type 手動維護造成不同步
// ------------------------------------------------------------
export type LabelKey = (typeof LABEL_KEYS)[number];

// ------------------------------------------------------------
//  LABEL_KEY_SET
//  - 提供集中管理的 Set + type guard
//  - Controller 不應該在維護一份 key 清單與檢查邏輯
// ------------------------------------------------------------
const LABEL_KEY_SET: ReadonlySet<string> = new Set(LABEL_KEYS);

// ------------------------------------------------------------
//  isLabelKey
//  - 確認 id:string 是否存在於 LABEL_KEY 表中
//  - Set.has 是 runtime 檢查；回傳型別透過 type predicate 提供 TS narrowing
// ------------------------------------------------------------
export function isLabelKey(id: string): id is LabelKey {
    return LABEL_KEY_SET.has(id);
}

// opt label 文字相對 opt 點的視覺偏移 (避免文字壓到點，造成難以點擊)
export const OPT_LABEL_NUDGE: PixelOffset = { offsetDx: 8, offsetDy: -8 };  // 往右 (dx: +8)，往上 (dy: -8)

// utility 文字固定放在左上角
const UTILITY_ANCHOR_PADDING_X = 12;
const UTILITY_ANCHOR_PADDING_Y = 18;

// utility 文字固定放在左上角（註記）
const UTILITY_FIXED_ANCHOR: PixelPoint = {
  x: UTILITY_ANCHOR_PADDING_X,
  y: UTILITY_ANCHOR_PADDING_Y,
};

// 排版用的「行高倍率」
// - indiff-eq 需要一個「穩定 anchor」：
//   用 fontSize 推導行距（語義是排版規則，不是拍腦袋座標）
export const LABEL_LINE_HEIGHT_RATIO = 1.4;

// 提供「固定方程式標籤」的 anchors（由 fontSize 推導排版）
// - indiff-eq 不應該綁曲線中點（會跟 opt 拖曳漂移；a 大時可能 NaN）
//    這裡把 indiff-eq 變成「圖的註記」，跟 utility-eq 同類：穩定、可讀。
export function buildFixedEquationAnchors(
  fontSize: number
): Partial<Record<LabelKey, PixelPoint>> {
  const anchors: Partial<Record<LabelKey, PixelPoint>> = {};

  // utility-eq：固定左上角
  anchors["utility-eq"] = UTILITY_FIXED_ANCHOR;

  // indiff-eq：固定放在 utility-eq 下方（排版：兩行距）
  const lineHeight = fontSize * LABEL_LINE_HEIGHT_RATIO;
  anchors["indiff-eq"] = {
    x: UTILITY_FIXED_ANCHOR.x,
    y: UTILITY_FIXED_ANCHOR.y + lineHeight * 2,
  };

  return anchors;
}


// ============================================================
//  Public API
// ============================================================

// ------------------------------------------------------------
//  clampToPlot (Public API)
//  - 把一個點的像素座標限制在「繪圖區（plot area）」內
//  - 避免 label 被拖曳到畫布外，造成看不到/點不到/拖不回來的 UX bug
//
//  Input：
//  - plotArea (width/height/padding)
//  - plotWidth / plotHeight：繪圖區大小（像素）
//  - padding：邊界留白（像素），避免文字貼邊或被裁切
//  - pixelX / pixelY：想要顯示的位置（像素）
//
//  Output：
//  - 回傳修正後的位置 PixelPoint: { pixelX, pixelY }（一定在可視/可點擊範圍內）
//
//  設計邏輯：
//  - 純函式（pure function）：不依賴外部狀態，易測試、易重用
//  - padding 讓 UI 更像正式圖表（期刊/投影片常見留白）
// ------------------------------------------------------------
export function clampToPlot(area: PlotArea, position: PixelPoint): PixelPoint {
    // sanitize width/height
    // 畫布尺寸若為 NaN/Infinity/負數，原本的 min/max 推導會出現 max < min，最後 clamp 出負座標
    let safeWidth = area.width;
    let safeHeight = area.height;

    if (!Number.isFinite(safeWidth)) {
        safeWidth = 0;
    }
    if (!Number.isFinite(safeHeight)) {
        safeHeight = 0;
    }
    if (safeWidth < 0) {
        safeWidth = 0;
    }
    if (safeHeight < 0) {
        safeHeight = 0;
    }

    // compute bounds first, then normalize if max < min
    // 若 padding 太大導致 max < min，直接降級為全域範圍（0..size），避免輸出負數
    let minX = area.padding;
    let maxX = safeWidth - area.padding;

    if (!Number.isFinite(minX)) {
        minX = 0;
    }
    if (!Number.isFinite(maxX)) {
        maxX = safeWidth;
    }

    if (maxX < minX) {
        minX = 0;
        maxX = safeWidth;
    }

    let minY = area.padding;
    let maxY = safeHeight - area.padding;

    if (!Number.isFinite(minY)) {
        minY = 0;
    }
    if (!Number.isFinite(maxY)) {
        maxY = safeHeight;
    }

    if (maxY < minY) {
        minY = 0;
        maxY = safeHeight;
    }
    
    let clampedX = position.x;    // pixelX
    let clampedY = position.y;    // pixelY

    if (!Number.isFinite(clampedX)) {
        clampedX = minX;
    }
    if (!Number.isFinite(clampedY)) {
        clampedY = minY;
    }

    // 左邊界：不能小於 padding
    if (clampedX < minX) {
        clampedX = minX;
    }
    // 右邊界：不能大於 width/height - padding
    if (clampedX > maxX) {
        clampedX = maxX;
    }
    // 上邊界：不能小於 padding
    if (clampedY < minY) {
        clampedY = minY;
    }
    // 下邊界：不能大於 width/height - padding
    if (clampedY > maxY) {
        clampedY = maxY;
    }

    // const clampedPixelPoint: PixelPoint = { x: clampedX, y: clampedY };

    return { x: clampedX, y: clampedY };    // { pixelX, pixelY }
}


// ------------------------------------------------------------
//  resolveLabelPos (Public API)
//  - labelPosition = anchorPosition + offset
//    負責把「某個 label 的 anchor（依附基準點）」，加上「偏移 offset（預設 or 使用者拖曳後）」
//    轉換成「label 的最終像素座標（尚未 clamp）」
//
//  - offset 有兩個來源:
//    - 1. defaultOffset: 尚未拖曳時的預設位置 (讓 UI 一開始就合理排版)
//    - 2. dragOffset: User 拖曳後記錄下來的相對偏移 (讓 label 可被移動)
//
//  Input:
//  - args.labelKey: LabelKey
//    - 表示你要算「哪一個 label」的位置（例如 "budget-eq" / "indiff-eq" ...）
//    - 用 union type 限制可用值，避免拼字錯誤造成 label 消失（防呆）
//
//  - args.anchorPx: PixelPoint
//    - anchor 是「基準點」（依附點），通常由 findLabelAnchorPx(...) 計算而得
//     （例如預算線中點、曲線中段、opt 點旁）
//    - 這個座標是像素座標，因此欄位名用 pixelX/pixelY 避免和 domain 座標混淆
//
//  - args.defaultOffsetDx / args.defaultOffsetDy: number
//    - label 尚未被拖曳時，預設要離 anchor 多遠（像素）
//
//  - args.dragOffsetByLabelKey: Partial<Record<LabelKey, PixelOffset>>
//    - 「拖曳偏移表」：記錄使用者拖曳後留下的 offset
//      - key：labelKey（是哪個 label）
//      - value：PixelOffset（相對 anchor 的 dx/dy）
//    - Partial<Record<LabelKey, PixelOffset>>:
//      - Record<LabelKey, PixelOffset>: 表示「每個 labelKey 都有一定有 offset」
//      - 通常只有被拖曳過的 label 才會有 offset，其他沒有，所以用 Partial 表示「可能有、可能沒有」//
//
//  Output
//  - 回傳 PixelPoint：{ pixelX, pixelY }，代表 label 最終的像素位置（注意：尚未 clamp）
//
//  設計邏輯：offset 存的是「相對 anchor 的偏移」
//  - anchor 會跟著圖形更新（budget 線重算、indiff 曲線重畫、opt 點移動）
//  - label 仍保持「相對」位置，而不是死釘在舊的絕對像素座標
// ------------------------------------------------------------
export function resolveLabelPos(args: {
    labelKey: LabelKey;
    anchor: PixelPoint;
    defaultOffsetDx: number;    // 預設偏移: 還沒拖曳之前 label 應該離 anchor 多遠
    defaultOffsetDy: number;
    dragOffsetByLabelKey: Partial<Record<LabelKey, PixelOffset>>;
}): PixelPoint {
    // 1) 先嘗試讀取「使用者是否拖曳過」這個 label 的 offset
    //    - 如果存在: 代表要用拖曳後的位置
    //    - 如果不存在: 代表
    const dragOffset = args.dragOffsetByLabelKey[args.labelKey];

    // 2) 先用「預設 offset」算出初始位置
    //    - 就算沒有 dragOffset，也能得到合理位置
    //    - 這樣 if (dragOffset) 只需要處理「覆蓋預設偏移」即可
    let pixelX = args.anchor.x + args.defaultOffsetDx;
    let pixelY = args.anchor.y + args.defaultOffsetDy;

    // 3) 若 dragOffset 存在，用「拖曳後偏移」覆蓋預設偏移
    if (dragOffset) {
        pixelX = args.anchor.x + dragOffset.offsetDx;
        pixelY = args.anchor.y + dragOffset.offsetDy;
    }

    // 4) 回傳 label 的最終像素座標 (尚未 clamp)
    return { x: pixelX, y: pixelY };    // Point2D: { pixelX, pixelY }
};


// ------------------------------------------------------------
//  findLabelAnchorsOnePass (Public API)
//  - 一次掃描 drawables，收集「需要貼著圖形」的 label anchor (Ex: budget-eq / opt-label)
//
//  - 原本是每次 findLabelAnchor(labelKey) 都掃一次 drawables（linear search）
//  - 目前圖元少沒差，但 AE LMS 未來：
//    - 多條曲線、多條線、多個點、多個 label
//    - drawables 會變多
//    - 多次 linear scan 會累積成本
//
//  Input:
//  - drawables: Drawable[]
//
//  Output:
//  - Partial<Record<LabelKey, PixelPoint>>
//  - 找不到就沒有該 key（不放進 object）
// ------------------------------------------------------------
export function findLabelAnchorsOnePass(
    drawables: Drawable[]
): Partial<Record<LabelKey, PixelPoint>> {
    const anchors: LabelAnchorState = {};
    
    
    // ------------------------------------------------------------
    // 掃描 drawables：一次走完，依 kind 分桶派發 handler
    // - 不使用 break/continue，所以用旗標讓 while 可以提早結束
    // ------------------------------------------------------------
    let drawableIdx = 0;
    let hasCollectedAllAnchors = false;

    while (drawableIdx < drawables.length && !hasCollectedAllAnchors) {
        const drawable = drawables[drawableIdx];

        // ------------------------------------------------------------
        // kind-based dispatch：避免大量 nested if-else
        // ------------------------------------------------------------
        if (drawable.kind === "line") {
            const tryCollect =
                ANCHOR_HANDLERS_BY_DRAWABLE_KIND.line[drawable.id];
            if (tryCollect) {
                tryCollect(drawable, anchors);
            }
        } else if (drawable.kind === "polyline") {
            const tryCollect =
                ANCHOR_HANDLERS_BY_DRAWABLE_KIND.polyline[drawable.id];
            if (tryCollect) {
                tryCollect(drawable, anchors);
            }
        } else if (drawable.kind === "point") {
            const tryCollect =
                ANCHOR_HANDLERS_BY_DRAWABLE_KIND.point[drawable.id];
            if (tryCollect) {
                tryCollect(drawable, anchors);
            }
        } else if (drawable.kind === "text") {
            const tryCollect =
                ANCHOR_HANDLERS_BY_DRAWABLE_KIND.text[drawable.id];
            if (tryCollect) {
                tryCollect(drawable, anchors);
            }
        } else {
        // drawable.kind === "mathSvg"
            const tryCollect =
                ANCHOR_HANDLERS_BY_DRAWABLE_KIND.mathSvg[drawable.id];
            if (tryCollect) {
                tryCollect(drawable, anchors);
            }
        }

        // utility-eq 是固定 anchor，這裡只檢查另外三個是否齊
        // 直接檢查 LabelKey 是否齊全（不再檢查 budgetEquationAnchor 之類的中介欄位）
        if (anchors["budget-eq"] && anchors["opt-label"]) {
            hasCollectedAllAnchors = true;
        }

        drawableIdx++;
    }

    return anchors;
}

// ------------------------------------------------------------
//  AnchorState (private)
//  - 直接以 LabelKey 為 key（避免再做 mapping/轉換）
//
//  - Record<LabelKey, PixelPoint>
//    - 做一個物件 (map/dictionary)
//      key: 只能是 LabelKey (Ex: "budget-eq" | "opt-label" | ...)
//      value: 是 PixelPoint (Ex: { x: 120, y: 80 })
// ------------------------------------------------------------
type LabelAnchorState = Partial<Record<LabelKey, PixelPoint>>;

// ------------------------------------------------------------
//  AnchorHandlersByDrawableKind (private)
//  - 依 drawable.kind 分桶，再以 drawable.id 查 handler
//    因為不同 kind 的 drawable 型別不同、欄位不同
//  - 新增規則只要加 handler，不需要讓 while 迴圈 if-else 越疊越深
// ------------------------------------------------------------
type AnchorHandlersByDrawableKind = {
    // 預算線 budget line
    line: Record<string, (drawableType: LineDrawable, state: LabelAnchorState) => void>;

    // opt 點
    polyline: Record<string, (drawableType: PolylineDrawable, state: LabelAnchorState) => void>;

    // indiff curve
    point: Record<string, (drawableType: PointDrawable, state: LabelAnchorState) => void>;

    // 一般文字
    text: Record<string, (drawableType: TextDrawable, state: LabelAnchorState) => void>;

    // 公式 mathSvg
    mathSvg: Record<string, (drawableType: MathSvgDrawable, state: LabelAnchorState) => void>;
};

// ------------------------------------------------------------
//  ANCHOR_HANDLERS_BY_DRAWABLE_KIND：規則表 (private)
//  - 修改原因：一眼看懂是「依 kind 分桶的 handlers 表」
// ------------------------------------------------------------
const ANCHOR_HANDLERS_BY_DRAWABLE_KIND: AnchorHandlersByDrawableKind = {
  line: { budget: collectBudgetEqAnchorFromBudgetLine, },
  polyline: {},  // indiff-eq 現在是「固定註記」而非貼著曲線
  point: { opt: collectOptLabelAnchorFromOptPoint, },
  text: {},
  mathSvg: {},
};

// ------------------------------------------------------------
// collectBudgetEqAnchorFromBudgetLine (private)
// - 若遇到 budget line（id === "budget"），收集其中點作為 budget-eq anchor
//
// Input:
// - drawable: LineDrawable, anchorState (收集容器)
// Output:
// - void (side effect: 寫入 anchorState)
// ------------------------------------------------------------
function collectBudgetEqAnchorFromBudgetLine(
    drawable: LineDrawable, 
    anchorState: LabelAnchorState
): void {
    if (anchorState["budget-eq"]) {
        return;
    }
    if (drawable.id !== "budget") {
        return;
    }

    const xMiddle = (drawable.minEndPoint.x + drawable.maxEndPoint.x) / 2;
    const yMiddle = (drawable.minEndPoint.y + drawable.maxEndPoint.y) / 2;

    anchorState["budget-eq"] = { x: xMiddle, y: yMiddle };
}

// ------------------------------------------------------------
// collectOptLabelAnchorFromOptPoint (private)
// - 若遇到 opt point（id === "opt"），收集「點中心 + nudge」作為 opt-label anchor
//
// Input:
// - drawable: PointDrawable, anchorState
//
// Output:
// - void (side effect)
// ------------------------------------------------------------
function collectOptLabelAnchorFromOptPoint(
    drawable: PointDrawable, 
    anchorState: LabelAnchorState): void {
  if (anchorState["opt-label"]) {
    return;
  }
  if (drawable.id !== "opt") {
    return;
  }

  anchorState["opt-label"] = {
    // x: drawable.center.x + OPT_LABEL_NUDGE.offsetDx,
    // y: drawable.center.y + OPT_LABEL_NUDGE.offsetDy,
    x: drawable.center.x,
    y: drawable.center.y,
  };
}
