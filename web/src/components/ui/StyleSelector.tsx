'use client'

import { FormLabel, Input } from './Input'
import { cn } from '@/lib/utils'
import { STYLE_PRESETS, type CaptureStyleInput } from '@/features/zones/types'

interface StyleSelectorProps {
  value: CaptureStyleInput
  onChange: (value: CaptureStyleInput) => void
}

export function StyleSelector({ value, onChange }: StyleSelectorProps) {
  return (
    <div className="space-y-lg">
      <div>
        <FormLabel className="block mb-sm">Pilih Style</FormLabel>
        <div className="grid grid-cols-2 tablet:grid-cols-4 gap-sm">
          {STYLE_PRESETS.map((preset) => {
            const active = value.presetId === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange({ ...value, presetId: preset.id })}
                className={cn(
                  'rounded-md border p-sm text-left transition-colors',
                  active ? 'border-primary ring-2 ring-primary-soft' : 'border-border hover:bg-canvas-secondary'
                )}
              >
                <div
                  className="h-10 rounded-xs mb-xs"
                  style={{ background: preset.colors.overlayBg, border: `2px solid ${preset.colors.accent}` }}
                />
                <span className="text-caption text-text-primary">{preset.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-xs">
        <FormLabel htmlFor="style-title">Title</FormLabel>
        <Input id="style-title" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      </div>

      <label className="flex items-center gap-sm">
        <input
          type="checkbox"
          className="w-5 h-5 rounded-xs border-border text-primary focus:ring-primary focus:ring-2"
          checked={value.showTimestamp}
          onChange={(e) => onChange({ ...value, showTimestamp: e.target.checked })}
        />
        <span className="text-label text-text-secondary">Tampilkan Timestamp</span>
      </label>
    </div>
  )
}
