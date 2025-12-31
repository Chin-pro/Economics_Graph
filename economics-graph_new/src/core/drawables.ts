/* drawable.ts */
//   - 定義 drawables 的資料格式 (line/point/text/...)
//   - 通用「可畫圖元」：完全不依賴 React / SVG / Canvas，只需要遵守同一份 Drawable 規格
//
//   - renderer（SvgSceneView）會把 Drawable 轉成真正 SVG 元素
//   - 它不綁任何渲染技術 (React/SVG/Canvas)，所以:
//     - 可以用 SVG renderer
//     - 可以用 Canvas renderer
//     - 可以用 WebGL ...

// 定義一個 二維向量 / 座標
export type Vec2 = { x: number; y: number };

// 線條樣式 (可選，以下屬性皆添加"?")
export type StrokeStyle = {
  width?: number;
  dash?: number[];
  color?: string;
};

// 填滿樣式 (可選)
export type FillStyle = {
  color?: string;
};

// TextSpan 用於 <tspan> (支援 baseline-shift 上/下標)
export type TextSpan = {
  text: string;
  dx?: number;
  dy?: number;
  baselineShift?: "sub" | "super" | number;
  fontSize?: number;
  fontStyle?: string;
  fontWeight?: string;
  kind?: "normal" | "sup" | "sub";
}

// 線段
export type LineDrawable = {
  kind: "line";  // 辨識標籤，告訴 renderer，這筆資料是一條線 (renderer 會 透過 switch (d.kind) 決定怎麼畫)
  id: string;    // 唯一識別 (Ex: budget)
  a: Vec2;       // 線段端點 (像素座標)
  b: Vec2;
  stroke?: StrokeStyle;  // 可選線條樣式
};

// 折線 (點列)
export type PolylineDrawable = {
  kind: "polyline";        // 折線
  id: string;
  points: Vec2[];          // 很多點串起來 (Ex: 無意曲線的取樣點)
  stroke?: StrokeStyle;    // 線條樣式 (通常無異曲線也是線)
};

// 點 (通常化成圓)
export type PointDrawable = {
  kind: "point";           // 表示「點」
  id: string;
  center: Vec2;            // 點的位置 (圓心)
  r: number;               // 半徑
  fill?: FillStyle;        // 填色
  stroke?: StrokeStyle;    // 圓的外框
};

// 文字
export type TextDrawable = {
  kind: "text";            // 文字 drawable
  id: string;
  pos: Vec2;               // 文字的定位點 (SVG <text x= y=> 的那個座標)

  text: string;            // 要顯示的文字內容，作為 fallback / debug / hit-test fallback (???)
  spans?: TextSpan[];      // spans: 若提供，就用 <tspan> 畫出類似 LaText 效果

  fontSize?: number;       // 可選字體大小
  fill?: FillStyle;        // 文字顏色 (可以跟預算線同色)
  draggable?: boolean;     // 文字是否可以拖曳 (方程式標籤用)
  textAnchor?: "start" | "middle" | "end";  // 置左/置中/置右
};

// =========================================================
// >>> [MOD] 新增：MathSvgDrawable
// - latex: 要渲染的 LaTeX
// - fontSize: 期刊化時仍需要控制相對大小（最後會用 scale 映射到 SVG）
// - color: 用 fill color 控制（MathJax SVG 主要是 path fill）
// - draggable: 讓方程式標籤可以拖曳
// - displayMode: true 會用 display math（更大更像獨立方程式）；false 是 inline
// =========================================================
export type MathSvgDrawable = {
  kind: "mathSvg";
  id: string;
  pos: Vec2;
  latex: string;
  fontSize?: number;
  fill?: FillStyle;
  draggable?: boolean;
  displayMode?: boolean;
};

// union type: Drawable 可以是以下4種其中之一
export type Drawable =
  | LineDrawable
  | PolylineDrawable
  | PointDrawable
  | TextDrawable
  | MathSvgDrawable;
;

export type SceneOutput = {
  width: number;
  height: number;
  drawables: Drawable[];

  // 讓外部也知道這張圖的經濟座標範圍，Ex: [0, xMax]、[0, xMin]
  xDomain: [number, number];
  yDomain: [number, number];
};

