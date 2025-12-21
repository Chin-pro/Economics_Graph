/* Viewport.ts */

// 經濟座標 -> 像素座標（不依賴 React）
// 注意：螢幕座標 y 往下變大，所以這裡把 y 反轉
export class Viewport {
  private readonly width: number;
  private readonly height: number;
  private readonly xDomain: [number, number];
  private readonly yDomain: [number, number];

  // 建構子
  constructor(
    width: number,
    height: number,
    xDomain: [number, number],  // 經濟座標 x 的範圍
    yDomain: [number, number],  // 經濟座標 y 的範圍
  ) {
    this.width = width;
    this.height = height;
    this.xDomain = xDomain;
    this.yDomain = yDomain;
  }
  
  // x (方法)
  //   - linear mapping: (v - d0)/(d1 - d0)
  //     - 1. (v - d0): 把 v 平移以 d0 為 0 的座標
  //     - 2. / (d1 - d0): 把它「正規化」到 0-1 之間的比例 t
  //     - 3. *this.width: 把 0-1 的比例拉伸到 0-width 的像素
  x(v: number): number {
    const d0 = this.xDomain[0];  // 最小 x
    const d1 = this.xDomain[1];  // 最大 x
    return ((v - d0) / (d1 - d0)) * this.width;
  }

  y(v: number): number {
    const d0 = this.yDomain[0];
    const d1 = this.yDomain[1];
    const t = (v - d0) / (d1 - d0);
    return this.height * (1 - t);  // "* (1-t)": 反轉
  }

  // 把一個點 (x,y) 轉換成像素點
  map(p: { x: number; y: number }) {  // p 是一個點物件，至少要有 {x,y}
    return { x: this.x(p.x), y: this.y(p.y) };  // 回傳也是 {x,y}，但是已經是像素座標
  }

  // 像素座標 -> 經濟座標 (互動性操作)
  unmap(p: { x: number; y: number }) {
    const x = this.unmapX(p.x);
    const y = this.unmapY(p.y);
    return { x, y };
  }

  // 像素 x 轉回 經濟 x
  private unmapX(px: number): number {
    const d0 = this.xDomain[0];
    const d1 = this.xDomain[1];

    // 防呆機制
    if (this.width === 0) {
      return d0;
    }
    if (d1 === d0) {
      return d0;
    }

    const t = px / this.width;
    return d0 + t * (d1 - d0);
  }

  // 像素 y 轉回 經濟 y
  private unmapY(py: number): number {
    const d0 = this.yDomain[0];
    const d1 = this.yDomain[1];

    if (this.height === 0) {
      return d0;
    }
    if (d1 === d0) {
      return d0;
    }
    
    // 注意：y 方向有反轉，所以 t = 1 - (py / height)
    const t = 1 - py / this.height;
    return d0 + t * (d1 - d0);
  }
}
