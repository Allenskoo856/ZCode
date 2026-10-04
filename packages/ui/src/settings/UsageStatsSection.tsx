import { AppUsagePanel } from "@/settings/usage-stats/AppUsagePanel.js";

// 内网离线 fork：Coding Plan 用量统计依赖云端计费接口，已随账号体系剔除；
// 仅保留本地 App 使用统计面板，tab 兼容类型保持不变。
export type UsageStatsSectionTab = "app" | "codingPlan" | `codingPlan:${string}`;

export function UsageStatsSection() {
  return <AppUsagePanel />;
}
