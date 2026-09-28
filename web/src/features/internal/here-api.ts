/**
 * HERE usage and budget cap — staff only (GET/PUT /internal/here-usage).
 * Never called from the customer app: customers must not see HERE or its costs.
 */

import { apiClient } from '@/lib/api-client'

export type HereSource = 'capture' | 'preview' | 'road_counts' | 'zone_stats'

export interface HereBudget {
  dailyLimit: number | null
  monthlyLimit: number | null
  costPer1000: number | null
}

export interface UsageCounts {
  requests: number
  failed: number
  refused: number
}

export interface UsageDay {
  day: string
  total: number
  failed: number
  refused: number
  bySource: Record<HereSource, number>
}

export interface HereUsageSummary {
  today: UsageCounts & { day: string }
  month: UsageCounts & { start: string }
  budget: HereBudget
  status: 'ok' | 'warning' | 'blocked'
  dailyUsed: number | null
  monthlyUsed: number | null
  estimatedMonthCost: number | null
  days: UsageDay[]
  budgetUpdatedAt: string | null
}

export const SOURCE_LABEL: Record<HereSource, string> = {
  capture: 'Captures',
  preview: 'Map previews',
  road_counts: 'Road-class counts',
  zone_stats: 'Zone stats',
}

export function getHereUsage(): Promise<HereUsageSummary> {
  return apiClient.get<HereUsageSummary>('/internal/here-usage')
}

export function setHereBudget(budget: HereBudget): Promise<HereUsageSummary> {
  return apiClient.put<HereUsageSummary>('/internal/here-usage', budget)
}
