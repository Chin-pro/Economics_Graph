/* drawable.ts */
//   - 定義 drawables 的資料格式 (line/point/text/...)
//   - 通用「可畫圖元」：完全不依賴 React / SVG / Canvas，只需要遵守同一份 Drawable 規格
//   - 它不綁任何渲染技術 (React/SVG/Canvas)，所以:
//     - 可以用 SVG renderer
//     - 可以用 Canvas renderer
//     - 可以用 WebGL ...

// 定義一個 二維向量 / 座標
export type Vec2 = { x: number; y: number };

// 線條樣式 (可選，因此以下屬性皆添加"?")
export type StrokeStyle = {
  width?: number;
  dash?: number[];
  color?: string;
};

// 填滿樣式 (可選)
export type FillStyle = {
  color?: string;
};

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
  text: string;            // 要顯示的文字內容
  fontSize?: number;       // 可選字體大小
};

// union type: Drawable 可以是以下4種其中之一
export type Drawable =
  | LineDrawable
  | PolylineDrawable
  | PointDrawable
  | TextDrawable;

export type SceneOutput = {
  width: number;
  height: number;
  drawables: Drawable[];

  // 讓外部也知道這張圖的經濟座標範圍，Ex: [0, xMax]、[0, xMin]
  xDomain: [number, number];
  yDomain: [number, number];
};

