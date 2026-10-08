'use client'

/**
 * The running server's configuration — read-only (BE-12, ADR-018).
 *
 * This page used to be a prototype that kept "config" in localStorage, with edit fields
 * and a rotate-secret dialog that changed nothing on any server. It now mirrors what the
 * API actually loaded from `.env`. Secrets show only whether they're set; connection
 * URLs have their password masked. Changing a value means editing api/.env and
 * restarting — deliberately, since a web form for secrets means storing them in the
 * database, and one mistyped value could take the platform down.
 */

import { StatusPill } from '@/components/ui/Badge'
import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { CardTitle } from '@/components/shared/SectionHeader'
import { ApiError } from '@/types/api'
import { getServerConfig, type ServerConfigEntry } from '@/features/internal/api'
import { CONFIG_GROUPS, VAR_BY_KEY, type ConfigGroupId } from '@/features/internal/catalog'

export default function InternalConfigPage() {
  const [entries, setEntries] = useState<ServerConfigEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getServerConfig()
      .then(setEntries)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the configuration.'))
  }, [])

  const grouped = useMemo(() => {
    const byGroup = new Map<ConfigGroupId | 'other', ServerConfigEntry[]>()
    for (const e of entries ?? []) {
      const group = VAR_BY_KEY.get(e.key)?.group ?? 'other'
      byGroup.set(group, [...(byGroup.get(group) ?? []), e])
    }
    return byGroup
  }, [entries])

  const unsetSecrets = (entries ?? []).filter((e) => e.secret && !e.set).map((e) => e.key)

  return (
    <div className="space-y-xl">
      <div>
        <p className="text-label text-text-secondary">Platform</p>
        <h1 className="text-page-title font-bold text-text-primary mt-xs">Configuration</h1>
        <p className="text-body text-text-secondary mt-xs">
          What the API server is running with. Read-only — to change a value, edit <code>api/.env</code> and restart the
          service.
        </p>
      </div>

      {error && <Alert variant="warning">{error}</Alert>}
      {unsetSecrets.length > 0 && (
        <Alert variant="warning">
          Not set: {unsetSecrets.join(', ')}. The features that need {unsetSecrets.length === 1 ? 'it' : 'them'} will
          fail until {unsetSecrets.length === 1 ? 'it is' : 'they are'} added to <code>api/.env</code>.
        </Alert>
      )}

      {entries === null && !error ? (
        <div className="space-y-lg">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 bg-canvas-secondary rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        [...CONFIG_GROUPS, { id: 'other' as const, title: 'Other', description: 'Keys without a description yet.' }].map(
          (group) => {
            const rows = grouped.get(group.id)
            if (!rows?.length) return null
            return (
              <Card key={group.id} className="p-lg space-y-md">
                <div>
                  <CardTitle>{group.title}</CardTitle>
                  <p className="text-caption text-text-muted mt-xs">{group.description}</p>
                </div>
                <dl className="divide-y divide-divider">
                  {rows.map((e) => (
                    <ConfigRow key={e.key} entry={e} />
                  ))}
                </dl>
              </Card>
            )
          },
        )
      )}
    </div>
  )
}

function ConfigRow({ entry }: { entry: ServerConfigEntry }) {
  const meta = VAR_BY_KEY.get(entry.key)
  return (
    <div className="grid grid-cols-1 tablet:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-xs tablet:gap-lg py-md">
      <dt className="min-w-0">
        <span className="block text-body font-semibold text-text-primary">{meta?.label ?? entry.key}</span>
        <code className="block text-micro text-text-muted mt-xs">{entry.key}</code>
        {meta?.help && <span className="block text-caption text-text-muted mt-xs">{meta.help}</span>}
      </dt>
      <dd className="min-w-0 flex items-start">
        {entry.secret ? (
          <StatusPill tone={entry.set ? 'success' : 'warning'}>{entry.set ? 'Set · hidden' : 'Not set'}</StatusPill>
        ) : entry.set ? (
          <code className="text-label text-text-primary break-all bg-canvas-secondary rounded-xs px-sm py-xs">{entry.value}</code>
        ) : (
          <span className="text-caption text-text-muted">
            Not set{meta?.defaultValue !== undefined && <> — default <code>{meta.defaultValue}</code></>}
          </span>
        )}
      </dd>
    </div>
  )
}
