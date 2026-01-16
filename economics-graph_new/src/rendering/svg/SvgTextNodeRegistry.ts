// src/mvc/view/svg/SvgTextNodeRegistry.ts
// ------------------------------------------------------------
// [NEW] Text DOM ref registry + prune
// 目的：
// - hit-test 需要 node.getBBox()，所以必須保存 <text> 的 DOM node
// - 但若不 prune，id 變多時會造成記憶體與 cache 汙染（長期成長）
// ------------------------------------------------------------

export class SvgTextNodeRegistry {
    private map: Map<string, SVGTextElement>;

    constructor() {
        this.map = new Map();
    }

    // ----------------------------------------------------------
    // set
    // Input：id, node（可能為 null）
    // Output：void
    // 設計目的：React ref callback 進來時更新 registry
    // ----------------------------------------------------------
    set(id: string, node: SVGTextElement | null): void {
        if (!node) {
        this.map.delete(id);
        return;
        }
        this.map.set(id, node);
    }

    // ----------------------------------------------------------
    // get
    // Input：id
    // Output：SVGTextElement | undefined
    // ----------------------------------------------------------
    get(id: string): SVGTextElement | undefined {
        return this.map.get(id);
    }

    // ----------------------------------------------------------
    // prune
    // Input：validIds（目前 scene 中仍存在的 text ids）
    // Output：void
    // 設計目的：避免 registry 成長造成 cache 汙染
    // ----------------------------------------------------------
    prune(validIds: Set<string>): void {
        for (const id of this.map.keys()) {
        if (!validIds.has(id)) {
            this.map.delete(id);
        }
        }
    }

    // ----------------------------------------------------------
    // clear
    // Input：none
    // Output：void
    // ----------------------------------------------------------
    clear(): void {
        this.map.clear();
    }
}
