/* Viewport.ts */

// 經濟座標 -> 像素座標（不依賴 React）
// 注意：螢幕座標 y 往下變大，所以這裡把 y 反轉
export class Viewport {
  private readonly innerWidth: number;
  private readonly innerHeight: number;
  private readonly xEconDomain: [number, number];
  private readonly yEconDomain: [number, number];

  // 建構子
  constructor(
    innerWidth: number,
    innerHeight: number,
    xEconDomain: [number, number],  // 經濟座標 x 的範圍
    yEconDomain: [number, number],  // 經濟座標 y 的範圍
  ) {
    this.innerWidth = innerWidth;
    this.innerHeight = innerHeight;
    this.xEconDomain = xEconDomain;
    this.yEconDomain = yEconDomain;
  }
  
  // =========================================================
  // 公開 getter：讓 View(AxesView) 讀得到 domain/size
  // =========================================================
  // 內容區寬度 (innerW)
  getInnerWidth(): number {
    return this.innerWidth;
  }

  // 內容區高度 (innerH)
  getInnerHeight(): number{
    return this.innerHeight
  }

  // 取得 xDomain (經濟座標 x 的範圍)
  getXEconDomain(): [number, number] {
    return this.xEconDomain;
  }

  // 取得 yDomain (經濟座標 y 的範圍)
  getYEconDomain(): [number, number] {
    return this.yEconDomain;
  }


  // x (方法)
  //   - linear mapping: (v - d0)/(d1 - d0) 
  //     - 1. (v - d0): 把 v 平移以 d0 為 0 的座標
  //     - 2. / (d1 - d0): 把它「正規化」到 0-1 之間的比例 t
  //     - 3. *this.width: 把 0-1 的比例拉伸到 0-width 的像素
  xEconToXPixel(xEconValue: number): number {
    const d0 = this.xEconDomain[0];  // 最小 x
    const d1 = this.xEconDomain[1];  // 最大 x

    // 防呆: 防止除以 0
    if (d1 === d0) {
      return 0;
    }

    return ((xEconValue - d0) / (d1 - d0)) * this.innerWidth;
  }

  yEconToYPixel(yEconValue: number): number {
    const d0 = this.yEconDomain[0];
    const d1 = this.yEconDomain[1];

    // 防呆: 防止除以 0
    if (d1 === d0) {
      return 0;
    }

    const t = (yEconValue - d0) / (d1 - d0);
    return this.innerHeight * (1 - t);  // "* (1-t)": 反轉
  }

  // map: 把一個點 (x,y) 轉換成像素點
  econToPixelMapping(p: { x: number; y: number }) {  // p 是一個點物件，至少要有 {x,y}
    return { x: this.xEconToXPixel(p.x), y: this.yEconToYPixel(p.y) };  // 回傳也是 {x,y}，但是已經是像素座標
  }

  // unmap: 像素座標 -> 經濟座標 (互動性操作)
  pixelToEconMapping(p: { x: number; y: number }) {
    const x = this.unmapX(p.x);
    const y = this.unmapY(p.y);
    return { x, y };
  }

  // 像素 x 轉回 經濟 x
  private unmapX(px: number): number {
    const d0 = this.xEconDomain[0];
    const d1 = this.xEconDomain[1];

    // 防呆機制
    if (this.innerWidth === 0) {
      return d0;
    }
    if (d1 === d0) {
      return d0;
    }

    const t = px / this.innerWidth;
    return d0 + t * (d1 - d0);
  }

  // 像素 y 轉回 經濟 y
  private unmapY(py: number): number {
    const d0 = this.yEconDomain[0];
    const d1 = this.yEconDomain[1];

    if (this.innerHeight === 0) {
      return d0;
    }
    if (d1 === d0) {
      return d0;
    }
    
    // 注意：y 方向有反轉，所以 t = 1 - (py / height)
    const t = 1 - py / this.innerHeight;
    return d0 + t * (d1 - d0);
  }
}
