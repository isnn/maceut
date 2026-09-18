'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { Checkbox, FormLabel, Input } from '@/components/ui/Input'
import { cn, formatDate } from '@/lib/utils'
import { useCurrentUser } from '@/features/auth/hooks/useAuth'
import * as configApi from '@/features/internal/config-api'
import { CONFIG_GROUPS, varsInGroup, type ConfigVarMeta } from '@/features/internal/catalog'
import type { ConfigPrimitive, ConfigValue, SecretMeta } from '@/features/internal/config-api'

type State = { values: Record<string, ConfigValue>; secrets: Record<string, SecretMeta> }

export default function InternalConfigPage() {
  const { user } = useCurrentUser()
  const [state, setState] = useState<State | null>(null)
  const [rotating, setRotating] = useState<ConfigVarMeta | null>(null)

  const load = useCallback(() => configApi.getConfigState(), [])
  const refetch = useCallback(() => load().then(setState), [load])

  useEffect(() => {
    load().then(setState)
  }, [load])

  const updatedBy = user?.email ?? 'unknown'

  async function commit(meta: ConfigVarMeta, value: ConfigPrimitive) {
    await configApi.updateConfigValue(meta.key, value, updatedBy)
    refetch()
  }

  if (!state) return <div className="h-96 bg-canvas-secondary rounded-lg animate-pulse" />

  const unsetSecrets = Object.values(state.secrets).filter((s) => !s.isSet).length

  return (
    <div className="space-y-lg">
      <div>
        <p className="text-label text-text-secondary">Platform · environment development</p>
        <h1 className="text-page-title font-bold text-text-primary mt-xs">Configuration</h1>
        <p className="text-body text-text-secondary mt-xs max-w-[72ch]">
          System settings shared by every workspace. Secrets are write-only — they can be rotated but never read back,
          here or through the API.
        </p>
      </div>

      {unsetSecrets > 0 && (
        <Alert variant="warning">
          {unsetSecrets} secret{unsetSecrets === 1 ? '' : 's'} without a value. Captures and uploads will fail until
          they&rsquo;re set.
        </Alert>
      )}

      <nav className="flex flex-wrap gap-sm text-caption text-text-secondary">
        <span className="text-text-muted">Jump to:</span>
        {CONFIG_GROUPS.map((group) => (
          <a key={group.id} href={`#${group.id}`} className="text-info no-underline hover:underline">
            {group.title}
          </a>
        ))}
      </nav>

      {CONFIG_GROUPS.map((group) => (
        <Card key={group.id} id={group.id} className="p-lg scroll-mt-24">
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <h2 className="text-heading-sm text-text-primary">{group.title}</h2>
              <p className="text-caption text-text-secondary mt-xs">{group.description}</p>
            </div>
            {!group.editable && (
              <span className="text-micro font-semibold bg-canvas-secondary text-text-muted border border-border rounded-xs px-sm py-xs">
                Read-only
              </span>
            )}
          </div>

          {!group.editable && (
            <Alert variant="info" className="mt-md">
              Set in the service&rsquo;s <code className="font-mono">.env</code> at deploy time. A web UI cannot swap
              these on a running system.
            </Alert>
          )}

          <ul className="mt-lg divide-y divide-divider">
            {varsInGroup(group.id).map((meta) => (
              <li key={meta.key} className="py-md first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="min-w-0">
                    <p className="flex items-center gap-sm flex-wrap">
                      <code className="font-mono text-label text-text-primary">{meta.key}</code>
                      {meta.requiresRestart && (
                        <span className="text-micro text-warning-text bg-warning-bg rounded-xs px-sm py-[1px]">
                          restart required
                        </span>
                      )}
                    </p>
                    <p className="text-caption text-text-secondary mt-xs">{meta.label}</p>
                    {meta.help && <p className="text-micro text-text-muted mt-xs max-w-[60ch]">{meta.help}</p>}
                  </div>

                  <div className="w-full tablet:w-80 shrink-0">
                    {meta.secret ? (
                      <SecretField
                        meta={meta}
                        secret={state.secrets[meta.key]}
                        editable={group.editable}
                        onRotate={() => setRotating(meta)}
                      />
                    ) : (
                      <ValueField
                        meta={meta}
                        current={state.values[meta.key]}
                        editable={group.editable}
                        onCommit={(value) => commit(meta, value)}
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {rotating && (
        <RotateDialog
          meta={rotating}
          onClose={() => setRotating(null)}
          onSaved={() => {
            setRotating(null)
            refetch()
          }}
          updatedBy={updatedBy}
        />
      )}
    </div>
  )
}

function SecretField({
  meta,
  secret,
  editable,
  onRotate,
}: {
  meta: ConfigVarMeta
  secret?: SecretMeta
  editable: boolean
  onRotate: () => void
}) {
  const isSet = secret?.isSet ?? false
  return (
    <div className="space-y-xs">
      <div className="flex items-center gap-sm">
        <span
          className={cn(
            'text-micro font-semibold rounded-xs px-sm py-xs',
            isSet ? 'bg-success-bg text-success-text' : 'bg-canvas-secondary text-text-muted border border-border'
          )}
        >
          {isSet ? 'Set' : 'Not set'}
        </span>
        <code className="font-mono text-label text-text-secondary">{isSet ? `••••••••${secret?.last4}` : '—'}</code>
        {editable && (
          <Button variant="secondary" size="sm" className="ml-auto" onClick={onRotate}>
            {isSet ? 'Rotate' : 'Set'}
          </Button>
        )}
      </div>
      {isSet && secret?.updatedAt && (
        <p className="text-micro text-text-muted">
          Rotated {formatDate(secret.updatedAt)} by {secret.updatedBy}
        </p>
      )}
      {!editable && <p className="text-micro text-text-muted">Not editable here — {meta.label.toLowerCase()} is deploy-time config.</p>}
    </div>
  )
}

function ValueField({
  meta,
  current,
  editable,
  onCommit,
}: {
  meta: ConfigVarMeta
  current?: ConfigValue
  editable: boolean
  onCommit: (value: ConfigPrimitive) => void
}) {
  const stored = current?.value ?? meta.defaultValue ?? ''
  const [draft, setDraft] = useState(String(stored))

  if (meta.type === 'boolean') {
    const checked = typeof stored === 'boolean' ? stored : stored === 'true'
    return (
      <label className="flex items-center gap-sm text-body text-text-secondary">
        <Checkbox checked={checked} disabled={!editable} onChange={(e) => onCommit(e.target.checked)} />
        {checked ? 'Enabled' : 'Disabled'}
      </label>
    )
  }

  return (
    <div className="space-y-xs">
      <Input
        value={draft}
        disabled={!editable}
        inputMode={meta.type === 'number' ? 'numeric' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        // Commit on blur rather than per keystroke — one write per edit.
        onBlur={() => {
          if (String(stored) === draft) return
          onCommit(meta.type === 'number' ? Number(draft) : draft)
        }}
        className="disabled:opacity-60 disabled:cursor-not-allowed font-mono text-label"
        aria-label={meta.key}
      />
      {current && (
        <p className="text-micro text-text-muted">
          Changed {formatDate(current.updatedAt)} by {current.updatedBy}
        </p>
      )}
    </div>
  )
}

function RotateDialog({
  meta,
  updatedBy,
  onClose,
  onSaved,
}: {
  meta: ConfigVarMeta
  updatedBy: string
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await configApi.rotateSecret(meta.key, value, updatedBy)
    // The plaintext lives only in this component's state and dies with it.
    setValue('')
    setSaving(false)
    onSaved()
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Popup className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[28rem] bg-card border border-border rounded-lg p-xl shadow-elevation-3">
          <Dialog.Title className="text-section-title text-text-primary">Rotate {meta.label}</Dialog.Title>
          <Dialog.Description className="text-caption text-text-secondary mt-xs mb-lg">
            <code className="font-mono">{meta.key}</code> — the current value cannot be shown. Entering a new one
            replaces it.
          </Dialog.Description>

          {meta.rotateWarning && (
            <Alert variant="warning" className="mb-lg">
              {meta.rotateWarning}
            </Alert>
          )}

          <div className="space-y-xs">
            <FormLabel htmlFor="secret-value">New value</FormLabel>
            <Input
              id="secret-value"
              type="password"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          {meta.requiresRestart && (
            <p className="text-micro text-text-muted mt-md">Takes effect after the service restarts.</p>
          )}

          <div className="flex justify-end gap-sm mt-xl">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || value.trim().length === 0}>
              {saving ? 'Saving…' : 'Save secret'}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
