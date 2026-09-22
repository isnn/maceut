'use client'

import { useMemo, useState } from 'react'
import type { SortDirection } from './Table'

/**
 * Search, sort and pagination for a table, in one place.
 *
 * Every data table in the app needs the same three things, and before this each one
 * either reimplemented them or went without: the zones table had search and sort but no
 * paging, the user directory had search only, and two tables had none at all. Three
 * implementations of "filter then sort" is three chances for them to disagree about
 * what an empty search or a null value means.
 *
 * Filtering happens in the browser, on rows already loaded. That is the right trade at
 * this scale — a workspace has at most 25 zones, and the user directory pages the API
 * until it has everyone — and it keeps sorting instant. It stops being the right trade
 * when the directory outgrows one fetch; at that point this hook's shape is what the
 * server call has to match, which is why the sort keys are plain strings.
 */

export interface TableControlsConfig<T> {
  rows: T[] | null
  /**
   * Text searched by the search box, per row. Returning several strings is a match on
   * any of them — an account is found by name or by email.
   */
  searchOn?: (row: T) => (string | null | undefined)[]
  /** Comparable value per sort key. `null` sorts last in both directions. */
  sortOn?: Record<string, (row: T) => string | number | null | undefined>
  /**
   * Which way a column points on its first click. Text reads best ascending and
   * quantities largest-first, so "sort by area" meaning "smallest first" would be
   * wrong about what the person wanted almost every time. Defaults to ascending.
   */
  defaultDirection?: Record<string, SortDirection>
  initialSort?: { key: string; direction: SortDirection } | null
  pageSize?: number
}

export interface TableControls<T> {
  search: string
  setSearch: (next: string) => void

  sort: { key: string; direction: SortDirection } | null
  toggleSort: (key: string) => void
  clearSort: () => void

  page: number
  setPage: (next: number) => void
  pageCount: number
  /** Rows for the current page — what the table body renders. */
  visible: T[]

  /** Rows after search, before paging. Drives "showing X of Y". */
  matchCount: number
  /** Rows before search. */
  totalCount: number
  /** True while `rows` is null, so the table can show its skeleton. */
  loading: boolean
  /** Echoed back so <Pagination> cannot disagree with the hook about page size. */
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 10

export function useTableControls<T>({
  rows,
  searchOn,
  sortOn,
  defaultDirection,
  initialSort = null,
  pageSize = DEFAULT_PAGE_SIZE,
}: TableControlsConfig<T>): TableControls<T> {
  const [search, setSearchRaw] = useState('')
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(initialSort)
  const [page, setPageRaw] = useState(1)

  // Any change to what is being listed sends you back to the first page. Staying on
  // page 4 of a result set that now has one page shows an empty table, which reads as
  // "no results" when the results are simply elsewhere.
  function setSearch(next: string) {
    setSearchRaw(next)
    setPageRaw(1)
  }

  function toggleSort(key: string) {
    const first = defaultDirection?.[key] ?? 'asc'
    setSort((current) => {
      if (current?.key !== key) return { key, direction: first }
      // Cycle: the column's natural direction, then reversed, then unsorted — so the
      // original order is reachable without reloading the page.
      if (current.direction === first) return { key, direction: first === 'asc' ? 'desc' : 'asc' }
      return null
    })
    setPageRaw(1)
  }

  function clearSort() {
    setSort(null)
    setPageRaw(1)
  }

  // Memoised rather than `rows ?? []` inline: that allocates a fresh array on every
  // render while rows is still loading, which changes the identity the filter and sort
  // memos depend on and makes both re-run for nothing.
  const all = useMemo(() => rows ?? [], [rows])

  const matched = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (term === '' || !searchOn) return all
    return all.filter((row) =>
      searchOn(row).some((field) => (field ?? '').toLowerCase().includes(term)),
    )
    // `all` is derived from `rows`; depending on it directly keeps the memo honest.
  }, [all, search, searchOn])

  const sorted = useMemo(() => {
    if (!sort || !sortOn?.[sort.key]) return matched
    const read = sortOn[sort.key]!
    const factor = sort.direction === 'asc' ? 1 : -1

    return [...matched].sort((a, b) => {
      const left = read(a)
      const right = read(b)

      // Unknown sorts last whichever way the column points. A null is "we do not know",
      // not "zero" or "empty string", so letting it ride to the top of a descending
      // sort would put the least informative rows first.
      const leftMissing = left === null || left === undefined
      const rightMissing = right === null || right === undefined
      if (leftMissing && rightMissing) return 0
      if (leftMissing) return 1
      if (rightMissing) return -1

      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor
      return String(left).localeCompare(String(right), 'id-ID') * factor
    })
  }, [matched, sort, sortOn])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  // Clamped rather than stored: deleting the last row of the last page must not strand
  // the table on a page that no longer exists.
  const currentPage = Math.min(page, pageCount)
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function setPage(next: number) {
    setPageRaw(Math.min(Math.max(1, next), pageCount))
  }

  return {
    search,
    setSearch,
    sort,
    toggleSort,
    clearSort,
    page: currentPage,
    setPage,
    pageCount,
    visible,
    matchCount: sorted.length,
    totalCount: all.length,
    loading: rows === null,
    pageSize,
  }
}
