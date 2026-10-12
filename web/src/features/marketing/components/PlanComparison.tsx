import { PLAN_LABEL, PLAN_LIMITS, PLAN_ORDER, PLAN_PRICE, ROAD_CLASS_LABEL } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import type { Plan } from '@/features/auth/types'

/**
 * Every plan limit side by side (FE-37). Each cell is read from PLAN_LIMITS / PLAN_PRICE,
 * the same numbers the API enforces, so the table cannot drift from the product.
 */
const ROWS: { label: string; value: (plan: Plan) => string }[] = [
  { label: 'Price', value: (p) => `${PLAN_PRICE[p].amount} ${PLAN_PRICE[p].period}` },
  { label: 'Zones', value: (p) => formatNumber(PLAN_LIMITS[p].zonesLimit) },
  { label: 'Captures a day', value: (p) => formatNumber(PLAN_LIMITS[p].capturesLimit) },
  { label: 'Active capture windows', value: (p) => formatNumber(PLAN_LIMITS[p].schedulesLimit) },
  { label: 'Fastest interval', value: (p) => PLAN_LIMITS[p].captureInterval },
  { label: 'Road classes', value: (p) => ROAD_CLASS_LABEL[PLAN_LIMITS[p].maxRoadClass] ?? '' },
  { label: 'History in CSV', value: (p) => PLAN_LIMITS[p].historyLabel },
  { label: 'Storage', value: (p) => `${formatNumber(PLAN_LIMITS[p].storageGb)} GB` },
  { label: 'Frames per export', value: (p) => formatNumber(PLAN_LIMITS[p].exportFramesLimit) },
  { label: 'Export formats', value: () => 'CSV, ZIP, MP4, WebM' },
]

export function PlanComparison() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[36rem] text-body">
        <caption className="sr-only">Plan comparison</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="sticky left-0 bg-card text-left font-semibold text-text-secondary px-lg py-md">
              <span className="sr-only">Feature</span>
            </th>
            {PLAN_ORDER.map((plan) => (
              <th key={plan} scope="col" className="text-left text-heading-sm text-text-primary px-lg py-md">
                {PLAN_LABEL[plan]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b border-divider last:border-0">
              <th scope="row" className="sticky left-0 bg-card text-left font-medium text-text-secondary px-lg py-md whitespace-nowrap">
                {row.label}
              </th>
              {PLAN_ORDER.map((plan) => (
                <td key={plan} className="px-lg py-md text-text-primary tabular-nums">
                  {row.value(plan)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
