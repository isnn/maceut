export type RoadClass = 'nasional' | 'nasional_provinsi' | 'semua'

export interface ZoneGeometry {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface Zone {
  id: string
  name: string
  geometry: ZoneGeometry
  roadClass: RoadClass
  createdAt: string
}

export interface CreateZoneInput {
  name: string
  geometry: ZoneGeometry
  roadClass: RoadClass
}

export interface StylePreset {
  id: string
  name: string
  colors: {
    overlayBg: string
    overlayText: string
    accent: string
  }
}

export interface CaptureStyleInput {
  presetId: string
  title: string
  showTimestamp: boolean
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'default', name: 'Default', colors: { overlayBg: '#111827', overlayText: '#FFFFFF', accent: '#5A35F3' } },
  { id: 'minimal', name: 'Minimal', colors: { overlayBg: '#FFFFFF', overlayText: '#1F1F24', accent: '#6B6B76' } },
  { id: 'bold', name: 'Bold', colors: { overlayBg: '#0A0A0A', overlayText: '#FFFFFF', accent: '#EF4444' } },
  { id: 'corporate', name: 'Corporate', colors: { overlayBg: '#0F172A', overlayText: '#F8FAFC', accent: '#3178F6' } },
]

export const DEFAULT_STYLE: CaptureStyleInput = { presetId: 'default', title: '', showTimestamp: true }
