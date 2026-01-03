// src/MVC/controller/ConsumerOptSceneBuilder.ts

// ------------------------------------------------------------
// SceneBuilder：只負責把 model + options → SceneOutput
// - 把「畫面場景組裝」抽出來，Controller 只負責協調（orchestration）
//
// - 把「經濟模型結果（econ domain）」組裝成「可渲染資料（pixel domain 的 drawables）」
// - SceneOutput 是 SvgSceneView / renderer 唯一需要的資料：
//   - width/height（畫布大小）
//   - drawables（要畫哪些圖元）
//   - xDomain/yDomain（讓外部知道 econ 範圍）
// - 同時回傳 viewport：
//   - 讓外部可以做 econ ↔ pixel 映射（例如互動拖曳點、顯示座標）
// 
// - 未來新增 CES/Quasilinear 之類的偏好，只要新增另一個 SceneBuilder，
//   而不必修改 Controller 內的 buildScene
//
// - Model (econ domain) -> Viewport (映射) -> Drawable (pixel domain)
//
// Scope:
// - SceneBuilder 不做 UI state 管理（例如 slider）
// - SceneBuilder 不處理 pointer 事件（那是 SvgSceneView 的事）
// - SceneBuilder 不直接畫 SVG，只輸出「可畫的資料」
// ------------------------------------------------------------

import type { Drawable, SceneOutput, Point2D } from "../../core/drawables";

// Viewport 是 runtime class (有 constructor/methods)，所以不用 type import
// 在 econ domain (經濟座標) 與 pixel (畫布座標) 之間的映射
import { Viewport } from "../../core/Viewport";

// model 只需要型別，SceneBuilder 不負責建立/實作 model，只接收一個 model 實例
import type { ConsumerOptModel } from "../model/ConsumerOptModel";

// ConsumerViewOptions: UI 控制項 (是否顯示標籤﹑顏色、字體大小...)
// 這是「View/Rendering 層面的需求」，不是經濟計算需求
import type { ConsumerViewOptions } from "../../core/types";

// computePlotInnerSize: 根據可用寬高、價格 px/py 等條件算出「內部繪圖區」
import { computePlotInnerSize } from "./consumerOptPlotSize";

// findLabelAnchor / resolveLabelPos:
// - findLabelAnchor: 根據現有 drawables 找「某個 label 應該錨定在哪個物件附件｣
// - resolveLabelPos: 用 anchor + offsets 算出最後 label 的位置 (可拖曳後記住偏移)
import { 
    clampToPlot, 
    // findLabelAnchor, 
    findLabelAnchorsOnePass,  // 改用一次掃描 anchors 的 API，避免每個 label 重複 linear scan
    resolveLabelPos,
    buildFixedEquationAnchors,  // 取得「indiff-eq / utility-eq 的穩定 anchors」
    type PlotArea,      // clamp 規則需要的最小環境參數
    type PixelPoint,
    type PixelOffset,
    type LabelKey,
    OPT_LABEL_NUDGE,    // single sourth of truth
} from "./consumerOptLabel";

// buildBudgetSpans / buildIndiffSpans / buildUtilitySpans:
// - 用來把 equation text 拆成多段 span (Ex: 上標、斜體、不同大小)
import { 
    buildBudgetSpans, 
    buildIndiffSpans, 
    buildUtilitySpans, 
    formatNum 
} from "./consumerOptEquation";


// ============================================================
// magic number
// - 這些常數全部只影響「內部計算與預設值」
// - 不影響外部 build() 的呼叫方式與型別
// ============================================================

// 初始 viewport 用的最小畫布（避免 0 尺寸造成除以 0 或 NaN）
const DEFAULT_INIT_PLOT_PIXEL_SIZE = 1;

// domain 留白比例：讓圖形不要貼邊
const DOMAIN_PADDING_RATIO = 1.2;

// indiff curve 採樣下界比例：避免 x 很小時數值爆炸
const CURVE_XMIN_RATIO = 0.05;

// indiff curve 采樣點數：越大越平滑，但計算/繪製成本越高
const CURVE_SAMPLE_COUNT = 60;

// 避免 x=0：因為 indiff curve 常用到 x^a，x=0 容易爆 NaN/Infinity
const CURVE_XMIN_EPS = 0.0001;

// // Opt label 預設相對位移（避免文字壓在點上）
// const OPT_LABEL_DX = 8;
// const OPT_LABEL_DY = -8;


// Opt point 半徑
const OPT_POINT_RADIUS = 4;

// 線條寬度
const STROKE_WIDTH = 2;

// label clamp padding：避免文字貼邊被裁切/難以點擊
const LABEL_CLAMP_PADDING_PX = 12;

// budget-eq anchor 是「線段中點」，若 offset = 0,0 常會壓在線上，
// 初始排版會難以閱讀/難以點擊；但這只是「初始位置」：
// 一旦使用者拖曳，dragOffset 會覆蓋這個預設值。
const BUDGET_EQ_DEFAULT_OFFSET: PixelOffset = { offsetDx: 10, offsetDy: 10 };

// indiff-eq 的 anchor 已經被設計成「固定註記」（由 buildFixedEquationAnchors 用 fontSize 排版決定），
// 再額外加 offset（例如 10,-10）反而變成新的 magic number，語義也矛盾。
const INDIFF_EQ_DEFAULT_OFFSET: PixelOffset = { offsetDx: 0, offsetDy: 0 };

// utility-eq 是固定註記（固定 anchor），不需要額外 offset
const UTILITY_EQ_DEFAULT_OFFSET: PixelOffset = { offsetDx: 0, offsetDy: 0 };



// ------------------------------------------------------------
// Domain tuple 型別
// - 避免 number[] 誤判成 tuple
// - 
// ------------------------------------------------------------
type DomainRange = [number, number];

// ------------------------------------------------------------
// LabelOffsets value 型別
// - 寫在 Record 裡，抽出來可重用/更清晰
// - offsetDx/offsetDy: 
// ------------------------------------------------------------
// type LabelOffsetValue = { offsetDx: number; offsetDy: number };

// ------------------------------------------------------------
//  LabelOffset (標籤拖曳偏移)
//  - key: labelId (Ex: "budget-eq")
//  - value: 使用者拖曳後的偏移量 offsetDx / offsetDy (pixel)
// ------------------------------------------------------------
type LabelOffsets = Partial<Record<LabelKey, PixelOffset>>;

// ------------------------------------------------------------
//  BuildSceneInput (buildScene 函數 的 input)
//  - controlOptions: UI 控制選項 (顯示/顏色/字體)
//  - labelOffsets: 拖曳後偏移 (讓 label 位置可被記住)
// ------------------------------------------------------------
type BuildSceneInput = {
    controlOptions: ConsumerViewOptions;
    labelOffsets: LabelOffsets;
};

// ------------------------------------------------------------
//  Domain 設定（經濟座標範圍與曲線採樣下界）：
//  - xEconMax / yEconMax：x/y domain 上界（有留白）
//  - xMin：indifference curve 採樣下界（避免 x→0 引發數值爆炸）
// ------------------------------------------------------------
type DomainConfig = {
  xEconMax: number;
  yEconMax: number;
  xCurveMin: number;
};

// ------------------------------------------------------------
// buildScene() 的輸出（外部呼叫方式不變）：
// - scene：Renderer 要畫的資料
// - viewport：座標映射器（互動/同步要用）
// ------------------------------------------------------------
type BuildSceneOutput = { scene: SceneOutput; viewport: Viewport };

// ------------------------------------------------------------
//  Plot 設定（pixel 尺寸 + viewport）：
//  - Plot 的完整運行配置
//  - plotWidth/plotHeight：內部繪圖區 pixel 大小
//  - viewport：把 econ domain 映射到 pixel canvas
 // ------------------------------------------------------------
type PlotConfig = {
  plotWidth: number;
  plotHeight: number;
  viewport: Viewport;
};

// ------------------------------------------------------------
//  Econ 計算結果（由 model 產生，仍在 econ domain）
//  - budget：預算線端點（econ）
//  - optEconPoint：最適點（econ）
//  - UtilityAtOptPoint：最適點效用值（用來生成通過最適點的 indifference curve）
//  - curveEconPts：無異曲線採樣點（econ）
// ------------------------------------------------------------
type EconResults = {
    // budget：預算線兩端點（econ）
    budget: { endPoint1: Point2D; endPoint2: Point2D };
    
    // optEconPoint：最適點（econ）
    optEconPoint: Point2D;
    
    // UtilityAtOptPoint：最適點效用值
    UtilityAtOptPoint: number;
    
    // curveEconPoints：通過最適點的一條無異曲線（econ points）
    curveEconPoints: Point2D[];
};

// ------------------------------------------------------------
// Pixel 轉換結果（把 EconResults 映射成 pixel domain）
//  - curvePixelPoints：polyline points（pixel）
//  - optPixel：最適點 pixel 座標
// ------------------------------------------------------------
type PixelResults = {
  curvePixelPoints: Point2D[];
  optPointPixel: Point2D;
};

// ------------------------------------------------------------
// BuildContext（建構上下文）
//  - 把 build() 途中所有中間結果集中存放
//  - 目的：拆方法後不用傳一堆參數，減少漏傳/順序錯誤
// ------------------------------------------------------------
type BuildContext = {
  // 外部輸入
  controlOptions: ConsumerViewOptions;
  labelOffsets: LabelOffsets;

  // model 參數（快照）
  params: { I: number; px: number; py: number; exponent: number };

  // domain / plot
  domain: DomainConfig;
  plot: PlotConfig;

  // 經濟結果 / pixel 結果
  econ: EconResults;
  pixel: PixelResults;

  // 場景 drawables（Renderer 只需要這個可變列表就能畫）
  drawables: Drawable[];
};


// ------------------------------------------------------------
//  Heavy cache：記住「重算結果」
//  - heavy 的定義：
//    computeDomain / computePlotAndViewport / computeEconomics / computePixelMappings
//
//  - light 的定義：
//    - buildBaseDrawables（含顏色，通常很便宜）
//    - appendOptDrawables / equation labels / clamp / sync
//
//  - cache key：innerAvailWidth/Height + (I, px, py, a)
//  - 只要這些不變，就視為 econ / curve / viewport 都可重用
// ------------------------------------------------------------
type HeavyCache = {
    key: string;
    domain: DomainConfig;
    plot: PlotConfig;
    econ: EconResults;
    pixel: PixelResults;
};


// ------------------------------------------------------------
//  Equation label 規格標
//  - 集中管理: anchor key / default offset / text / spans / color
//  - 讓新增 lable 不再複製 3 份 appendXXXLabel()
// ------------------------------------------------------------
type EquationLabelSpec = {
    key: LabelKey;    // 這裡只放 equation label keys (utility/budget/indiff)
    defaultOffset: PixelOffset;
    buildText: (context: BuildContext) => string;
    buildSpans: (context: BuildContext, fontSize: number) => any;
    getFillColor: (context: BuildContext) => string;

}

const EQUATION_LABEL_SPECS: EquationLabelSpec[] = [
  {
    key: "utility-eq",
    defaultOffset: { offsetDx: 0, offsetDy: 0 },
    buildText: (ctx) =>
      "U(x,y) = x^a y^(1-a),  a=" + formatNum(ctx.params.exponent),
    buildSpans: (ctx, fontSize) => buildUtilitySpans(ctx.params.exponent, fontSize),
    getFillColor: (ctx) => ctx.controlOptions.indiffColor,
  },
  {
    key: "budget-eq",
    defaultOffset: BUDGET_EQ_DEFAULT_OFFSET,
    buildText: (ctx) =>
      formatNum(ctx.params.px) +
      "x + " +
      formatNum(ctx.params.py) +
      "y = " +
      formatNum(ctx.params.I),
    buildSpans: (ctx, fontSize) =>
      buildBudgetSpans(ctx.params.px, ctx.params.py, ctx.params.I, fontSize),
    getFillColor: (ctx) => ctx.controlOptions.budgetColor,
  },
  {
    key: "indiff-eq",
    defaultOffset: INDIFF_EQ_DEFAULT_OFFSET,
    buildText: (ctx) =>
      "y = (U0 / x^a)^(1/(1-a)),  U0=" + formatNum(ctx.econ.UtilityAtOptPoint),
    buildSpans: (ctx, fontSize) =>
      buildIndiffSpans(ctx.econ.UtilityAtOptPoint, ctx.params.exponent, fontSize),
    getFillColor: (ctx) => ctx.controlOptions.indiffColor,
  },
];



export class ConsumerOptSceneBuilder {
    // model：提供經濟計算（budget/optimum/utility/curve）
    private readonly model: ConsumerOptModel;
    
    // innerAvailWidth/Height：內部可用繪圖空間 pixel 尺寸
    private readonly innerAvailWidth: number;
    private readonly innerAvailHeight: number;

    // Cache 欄位
    private heavyCache: HeavyCache | null;

    // ------------------------------------------------------------
    //  contructor
    //  - 注入 SceneBuilder 的必要依賴（model + 可用尺寸）
    //
    //  Input：
    //  - model: ConsumerOptModel
    //  - innerAvailW: number（pixel）
    //  - innerAvailH: number（pixel）
    //
    //  Output：
    //  - 無（建構物件本身，並保存依賴）
    //
    //  設計邏輯：
    //  - SceneBuilder 不建立 model，不量測 DOM
    //  - 外部組裝依賴，SceneBuilder 只組場景（SRP）
    // ------------------------------------------------------------
    constructor(args: {
        model: ConsumerOptModel; 
        innerAvailWidth: number; 
        innerAvailHeight: number
    }) {
        this.model = args.model;
        this.innerAvailWidth = args.innerAvailWidth;
        this.innerAvailHeight = args.innerAvailHeight;
        this.heavyCache = null;
    }

    // ------------------------------------------------------------
    // buildScene（Public API）- 外部呼叫方式不變
    // 1) initContext（拿 params + 放預設值）
    // 2) buildHeavyIfNeeded（cache hit → 直接套用；miss → 重算並存入 cache）
    // 3) buildLight（基礎圖元 + labels + clamp + sync）
    // 4) finalize
    // ------------------------------------------------------------
    buildScene(args: BuildSceneInput): BuildSceneOutput {
        const context = this.initContext(args);

        // heavy 計算: 有 cache 就跳過重算，避免 UI 拖曳造成塞車
        this.buildHeavyScene(context);

        // light 計算: 每次重建(便宜)，確保顏色/字體/顯示切換立即生效
        this.buildLightScene(context);

        return this.finalize(context);
    }


    // ============================================================
    //  Private Functions (internal)
    // ============================================================

    // ------------------------------------------------------------
    //  initContext
    //  - 建立 BuildContext
    //  - 讀取 model 參數快照（p）
    //  - 初始化預設值（domain/plot/econ/px/drawables）
    
    //  Input：
    //  - args：BuildInput（options + labelOffsets）
    
    //  Output：
    //  - ctx：BuildContext（後續步驟都在 ctx 上填值）
    // ------------------------------------------------------------
    private initContext(args: BuildSceneInput): BuildContext {
        // model 參數 snapshot (避免重複呼叫 getModelParams)
        const params = this.model.getModelParams();

        // 預設 domain/plot/econ/px: 先填入合理的預設值，後續方法再覆蓋
        const initInnerWidth = DEFAULT_INIT_PLOT_PIXEL_SIZE;
        const initInnerHeight = DEFAULT_INIT_PLOT_PIXEL_SIZE;
        const initXEconDomain: DomainRange = [0,1];
        const initYEconDomain: DomainRange = [0,1];

        const context: BuildContext = {
            controlOptions: args.controlOptions,
            labelOffsets: args.labelOffsets,
            params: params,
            
            domain: { xEconMax: 1, yEconMax: 1, xCurveMin: CURVE_XMIN_EPS},

            plot: {
                plotWidth: initInnerWidth,
                plotHeight: initInnerHeight,
                viewport: new Viewport(
                    initInnerWidth,     // innerWidth: number
                    initInnerHeight,    // innerHeight: number
                    initXEconDomain,    // xEconDomain: [number, number] 
                    initYEconDomain     // yEconDomain: [number, number] 
                ),
            },

            econ: {
                budget: { endPoint1: {x: 0, y: 0}, endPoint2: {x: 0, y: 0} },
                optEconPoint: { x: 0, y: 0 },
                UtilityAtOptPoint: 0,
                curveEconPoints: [],
            },

            pixel: { 
                curvePixelPoints: [], 
                optPointPixel: { x: 0, y: 0} 
            },
            drawables: [],
        }

        return context;
    };

    // ------------------------------------------------------------
    //  buildHeavyScene
    //  - 避免 label 拖曳 / 字體大小 / 顏色等 UI 變動造成的重算曲線
    //
    //  - cache hit: 把 cache 的 heavy 結果寫回 context
    //  - cache miss: 重算 heavy，並更新 cache
    // ------------------------------------------------------------
    private buildHeavyScene(context: BuildContext): void {
        const key = this.makeHeavyCacheKey(context.params);

        if (this.heavyCache) {
            if (this.heavyCache.key === key) {
                // cache hit: 重用 heavy 計算結果
                context.domain = this.heavyCache.domain;
                context.plot = this.heavyCache.plot;
                context.econ = this.heavyCache.econ;
                context.pixel = this.heavyCache.pixel;
                return;
            }
        }

        // cache miss：重算 heavy pipeline
        this.computeDomain(context);
        this.computePlotAndViewport(context);
        this.computeEconomics(context);
        this.computePixelMappings(context);

        // immutability guard（避免未來不小心改到 cache 內容）
        // - heavy cache 的結果應視為 immutable；freeze 能提早抓到「意外 mutation」的 bug
        this.freezeHeavyResults(context);

        // 更新 cache（重用 viewport / curvePixelPoints 的成果）
        this.heavyCache = {
            key: key,
            domain: context.domain,
            plot: context.plot,
            econ: context.econ,
            pixel: context.pixel,
        };
    }

    // ------------------------------------------------------------
    //  freezeHeavyResults
    //  - 把 heavy 結果視為 immutable（開發期抓 bug）
    // ------------------------------------------------------------
    private freezeHeavyResults(context: BuildContext): void {
        // domain/econ/pixel 都是 plain object，可凍結（viewport 是 class，不凍結）
        Object.freeze(context.domain);

        Object.freeze(context.econ.budget.endPoint1);
        Object.freeze(context.econ.budget.endPoint2);
        Object.freeze(context.econ.budget);

        Object.freeze(context.econ.optEconPoint);

        // curve arrays：凍結點物件，再凍結陣列
        let i = 0;
        while (i < context.econ.curveEconPoints.length) {
        Object.freeze(context.econ.curveEconPoints[i]);
        i++;
        }
        Object.freeze(context.econ.curveEconPoints);

        Object.freeze(context.econ);

        Object.freeze(context.pixel.optPointPixel);

        let j = 0;
        while (j < context.pixel.curvePixelPoints.length) {
        Object.freeze(context.pixel.curvePixelPoints[j]);
        j++;
        }
        Object.freeze(context.pixel.curvePixelPoints);

        Object.freeze(context.pixel);
    }

    // ------------------------------------------------------------
    //  makeHeavyCacheKey
    //  - key 必須包含：畫布可用尺寸 + model params
    //  - 這樣才不會在尺寸或參數變動時誤用 cache
    // ------------------------------------------------------------
    private makeHeavyCacheKey(params: { 
        I:number; 
        px: number; 
        py: number; 
        exponent: number 
    }): string {
        // 這裡使用 join 組字串
        const parts: string[] = [];

        parts.push(String(this.innerAvailWidth));
        parts.push(String(this.innerAvailHeight));

        parts.push(String(params.I));
        parts.push(String(params.px));
        parts.push(String(params.py));
        parts.push(String(params.exponent));

        return parts.join("|");
    }

    // ------------------------------------------------------------
    //  buildLightScene
    //  - 便宜的部分每次都跑
    //  - 確保 UI 立刻生效（顏色、字體、顯示/隱藏）
    // ------------------------------------------------------------
    private buildLightScene(context: BuildContext): void {
        this.buildBaseDrawables(context);
        this.appendOptDrawables(context);

        // 一次掃描取得 anchors（只從 drawables 蒐集）
        const anchorsFromDrawables = findLabelAnchorsOnePass(context.drawables);

        let anchors: Partial<Record<LabelKey, PixelPoint>> = anchorsFromDrawables;
        if (context.controlOptions.showEquationLabels) {
            const fontSize = context.controlOptions.labelFontSize;
            const fixed = buildFixedEquationAnchors(fontSize);
            anchors = {
                ...anchorsFromDrawables,
                ...fixed,
            };
        }

        // Equation labels 用「規格表」一次處理，不再 3 個 appendXXX 重複邏輯
        this.appendEquationLabels(context, anchors);

    }



    // ------------------------------------------------------------
    //  computeDomain 
    //  - 決定 econ domain（xEconMax/yEconMax）與曲線採樣下界 xMin
    //
    //  Input：
    //  context.params：包含 I, px, py, a
    //
    //  Output（寫入 context.domain）：
    //  - xEconMax：以 I/px 為基礎並留白
    //  - yEconMax：以 I/py 為基礎並留白
    //  - xMin：indiff curve 採樣下界（避免 x=0 導致數值問題）
    //
    //  設計邏輯：
    //  - 留白 1.2(DOMAIN_PADDING_RATIO)：避免圖形貼邊，不利觀察與拖曳
    //  - xCurveMin：取 max(0.0001, 0.05 * xEconMax) 避免 x→0 爆炸
    // ------------------------------------------------------------
    private computeDomain(context: BuildContext): void {
        const params = context.params;

        // x 軸 (經濟座標) 要畫到多大的上界 (單位: 商品數量)
        const xEconMax = (params.I / params.px) * DOMAIN_PADDING_RATIO;
        // y 軸 (經濟座標) 要畫到多大的上界 (單位: 商品數量)
        const yEconMax = (params.I / params.py) * DOMAIN_PADDING_RATIO;

        // 曲線採樣的建議下界（候選值）
        const xMinCandidate = xEconMax * CURVE_XMIN_RATIO;

        // 避免 x 很接近 0，最後取「0.0001 和 xEconMax*0.05 兩者間較大的值」
        let xCurveMin = CURVE_XMIN_EPS;
        if (xMinCandidate > xCurveMin) {
            xCurveMin = xMinCandidate;
        }

        // 畫圖的經濟座標範圍
        context.domain = { xEconMax, yEconMax, xCurveMin };
    }

    // ------------------------------------------------------------
    //  computePlotAndViewport
    //  - 根據可用尺寸 + 參數（px/py）決定 pixel plotSize
    //  - 建立 viewport（econ↔pixel 映射器）
    //  
    //  Input：
    //  - this.innerAvailWidth/this.innerAvailHeight：可用 pixel 尺寸
    //  - ctx.params：px/py
    //  - ctx.domain：xEconMax/yEconMax
    //  
    //  Output（寫入 context.plot）：
    //  - width/height：pixel
    //  - viewport：new Viewport(width,height,[0,xEconMax],[0,yEconMax])
    // ------------------------------------------------------------
    private computePlotAndViewport(context: BuildContext): void {
        const params = context.params;
        const domain = context.domain;

        const xEconDomain: DomainRange = [0, domain.xEconMax];
        const yEconDomain: DomainRange = [0, domain.yEconMax];

        const plotSize = computePlotInnerSize({
            containerInnerWidth: this.innerAvailWidth,
            containerInnerHeight: this.innerAvailHeight,
            px: params.px,
            py: params.py,
        });

        const vp = new Viewport(
            plotSize.plotInnerWidth,    // innerWidth: number
            plotSize.plotInnerHeight,   // innerHeight: number
            xEconDomain,                // xEconDomain: [number, number]
            yEconDomain                 // yEconDomain: [number, number]
        );

        context.plot = { 
            plotWidth: plotSize.plotInnerWidth, 
            plotHeight: plotSize.plotInnerHeight, 
            viewport: vp 
        };
    }

    // ------------------------------------------------------------
    //  computeEconomics
    //  - 呼叫 model 計算經濟結果：budget、optimum、U0、curve points
    //
    //  Input：
    //  - context.domain：xMin/xEconMax（曲線採樣範圍）
    //
    //  Output（寫入 ctx.econ）：
    //  - budget.endPoint1/endPoint2：預算線端點（econ）
    //  - optEconPont：最適點（econ）
    //  - U0：最適點效用值
    //  - curveEconPoints：通過最適點的 indifference curve 點（econ）
    // ------------------------------------------------------------
    private computeEconomics(context: BuildContext): void {
        const domain = context.domain;

        const modelBudget = this.model.computeBudget();
        const optEconPoint = this.model.computeOptimum();
        const utilityLevelAtOpt = this.model.computeUtilityAt(optEconPoint.x, optEconPoint.y);  // U0

        const curveEconPoints = this.model.computeIndifferenceCurve(
            utilityLevelAtOpt, 
            domain.xCurveMin, 
            domain.xEconMax, 
            CURVE_SAMPLE_COUNT,
        );

        const budget = {
            endPoint1: modelBudget.p1,
            endPoint2: modelBudget.p2,
        }

        context.econ = {
            budget: budget,
            optEconPoint: optEconPoint,
            UtilityAtOptPoint: utilityLevelAtOpt,
            curveEconPoints: curveEconPoints,
        };
    }

    // ------------------------------------------------------------
    //  computPixelMappings
    //  - 把 econ domain 的結果映射到 pixel domain
    //
    //  Input：
    //  - ctx.plot.viewport：econ↔pixel 映射器
    //  - ctx.econ：curveEconPts / optEcon
    //
    //  Output（寫入 ctx.px）：
    //  - curvePointPoints：polyline points（pixel）
    //  - optPointPoint：最適點（pixel）
    // ------------------------------------------------------------
    private computePixelMappings(context: BuildContext): void {
        // const vp = context.plot.viewport;
        // const econ = context.econ;
        
        // const curvePixelPoints = econ.curveEconPoints.map((point) => vp.econToPixelMapping(point));
        // const optPixelPoint = vp.econToPixelMapping(econ.optEconPoint);
        
        // context.pixel = { curvePixelPoints, optPixelPoint };
        const vp = context.plot.viewport;
        const econ = context.econ;

        const curvePixelPoints = econ.curveEconPoints.map((pt) => 
            vp.econToPixelMapping(pt)
        );
        const optPointPixel = vp.econToPixelMapping(econ.optEconPoint);

        context.pixel = { curvePixelPoints, optPointPixel };
    }

    // ------------------------------------------------------------
    //  buildBaseDrawables
    //  - light，便宜，且顏色會跟 UI 走
    //  - 建立「一定存在」的 drawables：budget line + indiff curve
    //
    //  Input：
    //  - context.plot.viewport：用來映射 budget 端點
    //  - context.econ.budget.endPoint1/endPoint2
    //  - context.pixel.curvePixelPoints
    //  - context.controlOptions：顏色
    //
    //  Output（寫入 context.drawables）：
    //  - drawables = [budgetLine, indiffCurve]
    // ------------------------------------------------------------
    private buildBaseDrawables(context: BuildContext): void {
        const vp = context.plot.viewport;
        const econ = context.econ;
        const pixel = context.pixel;
        const controlOption = context.controlOptions;

        const budgetLine: Drawable = {
            kind: "line",
            id: "budget",
            minEndPoint: vp.econToPixelMapping(econ.budget.endPoint1),
            maxEndPoint: vp.econToPixelMapping(econ.budget.endPoint2),
            stroke: { width: STROKE_WIDTH, color: controlOption.budgetColor },
        };

        const indiffCurve: Drawable = {
            kind: "polyline",
            id: "indiff",
            points: pixel.curvePixelPoints,
            stroke: { width: STROKE_WIDTH, color: controlOption.indiffColor },
        };

        context.drawables = [];
        context.drawables.push(budgetLine);
        context.drawables.push(indiffCurve);
    }

    // ------------------------------------------------------------
    //  appendOptDrawables
    //  - 若 controlOtpions.showOpt 為 true，加入 opt 點與 opt-label（可拖曳）
    //
    //  Input：
    //  - context.controlOptions.showOpt: 是否顯示
    //  - context.pixel.optPointPixel: 最適點 pixel 座標
    //  - context.controlOptions.optPointColor / optTextColor: 顏色
    //
    //  Output：
    //  - 若顯示: context.drawables 追加 point + text
    // ------------------------------------------------------------
    private appendOptDrawables(context: BuildContext): void {
        const controlOption = context.controlOptions;

        if (!controlOption.showOpt) {
            return;
        }

        const optPointPixel = context.pixel.optPointPixel;

        context.drawables.push({
            kind: "point",
            id: "opt",
            center: optPointPixel,
            r: OPT_POINT_RADIUS,
            fill: { color: controlOption.optPointColor },
        });
        
        const plotArea = this.getLabelPlotArea(context.plot);

        // opt-label 初始位置: 也進行 clamp，避免一開始就出界
        const optAnchor: PixelPoint = {
            x: optPointPixel.x + OPT_LABEL_NUDGE.offsetDx,
            y: optPointPixel.y + OPT_LABEL_NUDGE.offsetDy,
        }

        const rawOptLabelPos = resolveLabelPos({
            labelKey: "opt-label",
            anchor: optAnchor,
            defaultOffsetDx: 0,
            defaultOffsetDy: 0,
            dragOffsetByLabelKey: context.labelOffsets,
        });

        const clampedOptLabelPixel = clampToPlot(plotArea, rawOptLabelPos);

        context.drawables.push({
            kind: "text",
            id: "opt-label",
            // pos: { x: optPointPixel.x + OPT_LABEL_DX, y: optPointPixel.y + OPT_LABEL_DY },
            pos: clampedOptLabelPixel,
            text: "Opt",
            fontSize: 12,
            fill: { color: controlOption.optTextColor },
            draggable: true,
        });
    }

    // ------------------------------------------------------------
    //  appendEquationLabels：用規格表生成 equation labels
    //  - 消除 appendUtility/appendBudget/appendIndiff 3 份重複邏輯
    // ------------------------------------------------------------
    private appendEquationLabels(
        context: BuildContext,
        anchors: Partial<Record<LabelKey, PixelPoint>>
    ): void {
        const controlOption = context.controlOptions;

        if (!controlOption.showEquationLabels) {
            return;
        }

        const fontSize = controlOption.labelFontSize;
        const plotArea = this.getLabelPlotArea(context.plot);

        let specIdx = 0;
        while (specIdx < EQUATION_LABEL_SPECS.length) {
            const spec = EQUATION_LABEL_SPECS[specIdx];

            const anchor = anchors[spec.key];
            if (anchor) {
                const rawPos = resolveLabelPos({
                    labelKey: spec.key,
                    anchor: anchor,
                    defaultOffsetDx: spec.defaultOffset.offsetDx,
                    defaultOffsetDy: spec.defaultOffset.offsetDy,
                    dragOffsetByLabelKey: context.labelOffsets,
                });

                const clampedPos = clampToPlot(plotArea, rawPos);

                context.drawables.push({
                    kind: "text",
                    id: spec.key,
                    pos: clampedPos,
                    text: spec.buildText(context),
                    spans: spec.buildSpans(context, fontSize),
                    fontSize: fontSize,
                    fill: { color: spec.getFillColor(context) },
                    draggable: true,
                });
            }

            specIdx++;
        }
    }

    
    // ------------------------------------------------------------
    //  syncOptLabelPosition
    //  - 若 showOpt 為 true，讓 opt-label 每次 build 時重新依 anchor + offsets 決定位置
    //  - 避免 opt 點移動（參數改變）後，label 還停在舊位置
    //
    //  Input：
    //  - context.controlOptions.showOpt
    //  - context.drawables（必須包含 opt-label 才會更新）
    //  - context.labelOffsets（offsetDx/offsetDy）
    //
    //  Output：
    //  - 更新 drawables 中 id="opt-label" 的 pos
    // ------------------------------------------------------------
    private syncOptLabelPosition(
        context: BuildContext,
        anchors: Partial<Record<LabelKey, PixelPoint>>,
    ): void {
        if (!context.controlOptions.showOpt) {
            return;
        }

        // const optAnchor = findLabelAnchor(context.drawables, "opt-label");
        const optAnchor = anchors["opt-label"];
        if (!optAnchor) {
            return;
        }

        const optPos = resolveLabelPos({
            labelKey: "opt-label",
            anchor: optAnchor,
            defaultOffsetDx: 0,
            defaultOffsetDy: 0,
            dragOffsetByLabelKey: context.labelOffsets,
        });

        const plotArea = this.getLabelPlotArea(context.plot);
        const clampedOptPos = clampToPlot(plotArea, optPos);

        // // 掃描 drawables，找到 opt-label text 並更新 pos
        // let drawableIdx = 0;
        // while (drawableIdx < context.drawables.length) {
        //     const drawable = context.drawables[drawableIdx];

        //     if (drawable.kind === "text" && drawable.id === "opt-label") {
        //         // 直接覆蓋 pos（不改其他屬性）
        //         // 若你的 Drawable.Text 型別是 readonly 或 union 寫入受限，這裡用 any 做型別逃逸
        //         (drawable as any).pos = clampedOptPos;
        //     }
        //     drawableIdx++;
        // }

        // immutable update，避免 (drawable as any).pos
        context.drawables = this.updateTextPosById(context.drawables, "opt-label", clampedOptPos);
    }


    // ------------------------------------------------------------
    //  finalize
    //  - 把 context 的 plot/domain/drawables 組裝成 SceneOutput
    //  - 回傳 { scene, viewport }
    //
    //  Input：
    //  - context.plot.plotWidth/plotHeight/viewport
    //  - context.domain.xEconMax/yEconMax
    //  - context.drawables
    //
    //  Output：
    //  - BuildOutput：{ scene, viewport }
    // ------------------------------------------------------------
    private finalize(context: BuildContext): BuildSceneOutput {
        const scene: SceneOutput = {
            width: context.plot.plotWidth,
            height: context.plot.plotHeight,
            drawables: context.drawables,
            xDomain: [0, context.domain.xEconMax],
            yDomain: [0, context.domain.yEconMax],
        };

        return { scene, viewport: context.plot.viewport };
    }

    // ------------------------------------------------------------
    //  getLabelPlotArea
    // ------------------------------------------------------------
    private getLabelPlotArea(plot: PlotConfig): PlotArea {
        return {
            width: plot.plotWidth,
            height: plot.plotHeight,
            padding: LABEL_CLAMP_PADDING_PX,
        };
    }

    // ============================================================
    // Helper: updateTextPosById (pure function)
    // - 不用 any
    // - 不改原陣列、不改原物件
    // - 找到指定 id 的 text drawable 就回傳「帶新 pos 的新物件」
    // ============================================================
    private updateTextPosById(drawables: Drawable[], targetId: string, nextPos: PixelPoint): Drawable[] {
        const updated: Drawable[] = [];

        let drawableIdx = 0;
        while (drawableIdx < drawables.length) {
            const drawable = drawables[drawableIdx];

            if (drawable.kind === "text" && drawable.id === targetId) {
            // 這裡已經被 narrowing 成 text drawable，TS 允許安全覆蓋 pos
            updated.push({
                ...drawable,
                pos: nextPos,
            });
            } else {
            updated.push(drawable);
            }

            drawableIdx++;
        }
        return updated;
    }


}




