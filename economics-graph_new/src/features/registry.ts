// src/features/registry.ts
// ------------------------------------------------------------
// FeatureRegistry
//
// Step 2 目的：
// - AppView 不再直接 import / new 某個 feature 的 controller
// - 只透過「FeatureModule 介面」取得 controller
// - 未來新增供需/賽局/一般均衡，只要把 module 註冊進來即可
//
// 注意：
// - 目前只註冊 consumerOpt（單一 feature）
// - registry 不放任何 React UI，保持純 domain/app wiring
// ------------------------------------------------------------

import type { FeatureId, FeatureModule } from "./types";
import { consumerOptModule } from "./consumerOpt/module";

// ------------------------------------------------------------
// Registry（以 id 作為 key）
// ------------------------------------------------------------
const REGISTRY: Record<string, FeatureModule> = {
  [consumerOptModule.id]: consumerOptModule,
};

// ------------------------------------------------------------
// Default feature（App 啟動時使用）
// ------------------------------------------------------------
export const DEFAULT_FEATURE_ID: FeatureId = consumerOptModule.id;

// ------------------------------------------------------------
// getFeatureModule
// - Input: feature id
// - Output: FeatureModule（找不到就 throw，避免 silent failure）
// ------------------------------------------------------------
export function getFeatureModule(id: FeatureId): FeatureModule {
  const mod = REGISTRY[id];
  if (!mod) {
    throw new Error(`[FeatureRegistry] Unknown feature id: ${String(id)}`);
  }
  return mod;
}

// ------------------------------------------------------------
// listFeatureIds / listFeatureModules（未來做 feature switch UI）
// ------------------------------------------------------------
export function listFeatureIds(): FeatureId[] {
  return Object.keys(REGISTRY);
}

export function listFeatureModules(): FeatureModule[] {
  return Object.values(REGISTRY);
}
