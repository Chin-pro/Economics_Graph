// src/MVC/controller/consumerOptLabel.ts

// ------------------------------------------------------------
//  Label anchor / offset / clamp
//  SRP：把「可拖曳標籤」的幾何規則獨立出來
// ------------------------------------------------------------

import type { Drawable, Point2D } from "../../core/drawables";

// ------------------------------------------------------------
// PlotArea
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


// labelKey 以 union type 表示
//  - [Update] 新增 new label，需要在這裡添加
export type LabelKey = "budget-eq" | "indiff-eq" | "opt-label" | "utility-eq";

// ------------------------------------------------------------
//  AnchorResolver
//  - 給一組 drawables，然後找到 anchor (像素座標) 或 null
//    每個 labelKey 對應一個「如何找到 anchor」的規則 (像素規格表)
//    每個 label 的 anchor 計算規則（策略）都必須符合這個「函式介面」
// 
//  Input：
//  - drawables（整張圖的圖元清單）
// 
//  Output：
//  - anchor 的像素座標（PixelPoint），找不到就回 null
// ------------------------------------------------------------
type AnchorResolver = (drawables: Drawable[]) => PixelPoint | null;


// opt label 文字相對 opt 點的視覺偏移 (避免文字壓到點，造成難以點擊)
const OPT_LABEL_NUDGE: PixelOffset = { offsetDx: 8, offsetDy: -8 };  // 往右 (dx: +8)，往上 (dy: -8)

// utility 文字固定放在左上角
const UTILITY_FIXED_ANCHOR: PixelPoint = { x: 12, y: 18 };  // { pixelX, pixelY }


// ============================================================
//  Public API
// ============================================================

// ------------------------------------------------------------
//  clampToPlot (Public API)
//  - 把一個點的像素座標限制在「繪圖區（plot area）」內
//  - 避免 label 被拖曳到畫布外，造成看不到/點不到/拖不回來的 UX bug
//
//  Input：
//  - pixelX / pixelY：想要顯示的位置（像素）
//  - plotWidth / plotHeight：繪圖區大小（像素）
//  - plotPaddingPx：邊界留白（像素），避免文字貼邊或被裁切
//
//  Output：
//  - 回傳修正後的位置 { pixelX, pixelY }（一定在可視/可點擊範圍內）
//
//  設計邏輯：
//  - 純函式（pure function）：不依賴外部狀態，易測試、易重用
//  - padding 讓 UI 更像正式圖表（期刊/投影片常見留白）
// ------------------------------------------------------------
// export function clampToPlot(args: {
//     pixelX: number;
//     pixelY: number;
//     plotWidth: number;
//     plotHeight: number;
//     plotPadding: number;
// }): PixelPoint {  // return { pixelX, pixelY }
//     const plotPadding = args.plotPadding;
    
//     // 設定邊界座標
//     let clampedX = args.pixelX;
//     let clampedY = args.pixelY;

//     // 左邊界：不能小於 padding
//     if (clampedX < plotPadding) {
//         clampedX = plotPadding;
//     }
//     // 上邊界：不能小於 padding
//     if (clampedY < plotPadding) {
//         clampedY = plotPadding;
//     }

//     // 右邊界 (扣除 padding)：不能大於 width - padding
//     if (clampedX > args.plotWidth - plotPadding) {
//         clampedX = args.plotWidth - plotPadding;
//     }
    
//     // 下邊界 (扣除 padding)：不能大於 width - padding
//     if (clampedY > args.plotHeight - plotPadding) {
//         clampedY = args.plotHeight - plotPadding;
//     }
    
//     // 回傳被修正後的位置
//     return { x: clampedX, y: clampedY };  // Point2D: { pixelX, pixelY }
// };

export function clampToPlot(area: PlotArea, position: PixelPoint): PixelPoint {
    let clampedX = position.x;    // pixelX
    let clampedY = position.y;    // pixelX

    // 左/上邊界：不能小於 padding
    if (clampedX < area.padding) {
        clampedX = area.padding;
    }
    if (clampedY < area.padding) {
        clampedY = area.padding;
    }

    // 右/下邊界：不能大於 width/height - padding
    if (clampedX > area.width - area.padding) {
        clampedX = area.width - area.padding;
    }
    if (clampedY > area.height - area.padding) {
        clampedY = area.height - area.padding;
    }

    return { x: clampedX, y: clampedY };  // { pixelX, pixelY }
}


// ------------------------------------------------------------
//  resolveLabelPos (供外部調用的函數)
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
// findLabelAnchor (Public API)
// - 對外提供統一 API：外部不用知道每種 label 的內部規則
//
// Input：
// - drawables：圖元清單
// - labelKey：要找哪個 label 的 anchor（被 union type 保護）
//
// Output：
// - PixelPoint：anchor 像素座標
// - 或 null：找不到相對應的圖元（外部通常就不畫該 label）
// ------------------------------------------------------------
export function findLabelAnchor(drawables: Drawable[], labelKey: LabelKey): PixelPoint | null {
    // 用 labelKey 查表拿到對應 resolver
    // 由於 labelKey 是 LabelKey union，所以這裡一定能拿到 resolver (不會 undefined)
    const resolver = ANCHOR_RESOLVER_BY_LABEL[labelKey];

    // 執行 resolver 計算 anchor，並回傳結果
    return resolver(drawables);
}

// ------------------------------------------------------------
//  ANCHOR_RESOLVER_BY_LABEL
//  - 查表 (mapping) 索引: 集中「key → 規則」的關係
//  
//  Record<LabelKey, AnchorResolver>:
//  - 需要提供每一個 LabelKey 的 resolver
//  - 未來新增 LabelKey 時，但忘了添加 resolver，TS 會直接報錯
// ------------------------------------------------------------
const ANCHOR_RESOLVER_BY_LABEL: Record<LabelKey, AnchorResolver> = {
    "budget-eq": resolveBudgetEquationAnchor,
    "indiff-eq": resolveIndiffEquationAnchor,
    "opt-label": resolveOptLabelAnchor,
    "utility-eq": resolveUtilityEquationAnchor,
}


// ============================================================
//  Private Functions (internal)
// ============================================================

// ------------------------------------------------------------
// resolveBudgetEquationAnchor
// - 找到 budget line（id === "budget" 的 line drawable）
// - 回傳該線段的「中點」作為 budget-eq 的 anchor
//
// Input：drawables（所有圖元）
//
// Output：PixelPoint（中點）或 null（找不到）
//
// 設計邏輯：
// - 用 while 掃描：明確、可控，且符合你偏好不使用 break/continue
// - 找到第一條符合的線就 return（提前結束）
// ------------------------------------------------------------
function resolveBudgetEquationAnchor(drawables: Drawable[]): PixelPoint | null {
    let drawableIndex = 0;

    while (drawableIndex < drawables.length) {
        const drawable = drawables[drawableIndex];

        // drawable.kind === "line" 會觸發 TS 的「型別收斂」(narrowing)，收斂為 LineDrawable
        // 讓 TS 知道 drawable 具有 a/b 兩端點，可以安全讀取 drawable.a/drawable.b
        if (drawable.kind === "line" && drawable.id === "budget") {
            const middleX = (drawable.minEndPoint.x + drawable.maxEndPoint.x) / 2;
            const middleY = (drawable.minEndPoint.y + drawable.maxEndPoint.y) / 2;

            // 線段中點公式: 兩端點平均
            return { x: middleX, y: middleY };  // Point2D: { pixelX, pixelY }
        }
        drawableIndex++;
    }

    // 掃描整個陣列，若仍找不到，回傳 null
    return null;
}

// ------------------------------------------------------------
// resolveIndiffEquationAnchor
// - 找到 indiff polyline（id === "indiff"）
// - 回傳 polyline 的「中間點」作為 indiff-eq 的 anchor
//
// Input：drawables
// Output：PixelPoint 或 null
//
// 設計邏輯：
// - polyline 可能有很多點，用中間索引是一個成本低、效果好的近似
// - 若 points 為空，回 null（避免回傳莫名座標）
// ------------------------------------------------------------
function resolveIndiffEquationAnchor(drawables: Drawable[]): PixelPoint | null {
    let drawableIndex = 0;

    while (drawableIndex < drawables.length) {
        const drawable = drawables[drawableIndex];

        // kind === "polyline" 後，TS 知道 drawable 有 points 屬性
        if (drawable.kind === "polyline" && drawable.id === "indiff") {
            const pointCount = drawable.points.length;

            // 防呆機制: 沒有點 就沒有 anchor
            if (pointCount <= 0) {
                return null;
            }

            // Math.floor: 將索引轉成整數 (陣列索引必須是整數)
            const middlePointIndex = Math.floor(pointCount / 2);

            const middlePoint = drawable.points[middlePointIndex];

            return { x: middlePoint.x, y: middlePoint.y };  // Point2D: { pixelX, pixelY }
        }
        drawableIndex++;
    }
    return null;
}

// ------------------------------------------------------------
// resolveOptLabelAnchor
// - 找到 opt point（id === "opt" 的 point drawable）
// - 回傳「點中心 + 視覺偏移」作為 opt-label 的 anchor
//
// Input：drawables
// Output：PixelPoint 或 null
//
// 設計邏輯：
// - 不直接回傳點中心，避免文字壓在點上
// - 使用 OPT_LABEL_NUDGE 集中管理偏移，未來調整方便
// ------------------------------------------------------------
function resolveOptLabelAnchor(drawables: Drawable[]): PixelPoint | null {
    let drawableIndex = 0;

    while (drawableIndex < drawables.length) {
        const drawable = drawables[drawableIndex];

        // kind === "point" 後，TS 知道 drawable 有 center 屬性
        if (drawable.kind === "point" && drawable.id === "opt") {
            return {
                x: drawable.center.x + OPT_LABEL_NUDGE.offsetDx,
                y: drawable.center.y + OPT_LABEL_NUDGE.offsetDy,
            };    // Point2D: { pixelX, pixelY }
        }
        drawableIndex++;
    }
    return null;
}

// ------------------------------------------------------------
// resolveUtilityEquationAnchor
// - utility-eq 是「整張圖的註記」，固定放左上角
//
// Input：drawables（但不需要用到）
// Output：固定 PixelPoint
//
// 設計邏輯：
// - 參數命名為 _drawables：表示刻意不使用，讓讀者/工具知道不是忘了用
// - 回傳常數 UTILITY_FIXED_ANCHOR，避免 magic number
// ------------------------------------------------------------
function resolveUtilityEquationAnchor(_drawables: Drawable[]): PixelPoint | null {
    return UTILITY_FIXED_ANCHOR;
}


