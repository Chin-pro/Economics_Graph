// src/mvc/view/rafCoalescer.ts

// ------------------------------------------------------------
// RafCoalescer
// 目的：把「同一個 frame 內多次更新」合併成一次 commit
// - 避免連續 setState 造成重繪抖動
// - GraphView 不做 Heavy 計算，但必須避免 UI 更新過密
// ------------------------------------------------------------

export class RafCoalescer<T> {
  private rafId: number | null;
  private pending: T | null;

  public constructor() {
    this.rafId = null;
    this.pending = null;
  }

  /**
   * request
   * Input:
   * - next: T（最新要提交的狀態快照）
   * - commit: (next: T) => void（真正把狀態提交出去的函式，通常是 setState）
   * Output:
   * - void
   *
   * 設計目的：
   * - 如果同一 frame 內呼叫多次 request，只保留「最後一次」的 next
   * - 在下一個 animation frame 只 commit 一次
   */
  public request(next: T, commit: (next: T) => void): void {
    this.pending = next;

    if (this.rafId !== null) {
      return;
    }

    this.rafId = window.requestAnimationFrame(() => {
      const latest = this.pending;
      this.pending = null;
      this.rafId = null;

      if (latest) {
        commit(latest);
      }
    });
  }

  /**
   * cancel
   * Input: none
   * Output: void
   *
   * 設計目的：
   * - componentWillUnmount 時取消 raf，避免 memory leak
   */
  public cancel(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pending = null;
  }
}
