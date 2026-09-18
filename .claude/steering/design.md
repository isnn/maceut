# DESIGN.md — Frontend Design System

> Baca saat: membuat komponen baru, styling halaman, atau menentukan warna/spacing/typography.
> Ini adalah **satu-satunya referensi styling** untuk frontend Maceut. Jangan improvisasi di luar token ini.

---

## Philosophy

Interface Maceut mengikuti prinsip **white-first, border-driven, single-accent**:

- Permukaan putih mendominasi — data dan aksi adalah fokus utama, bukan dekorasi
- Satu aksen ungu (`#5A35F3`) untuk semua interaksi utama: CTA, focus state, progress aktif
- Hierarki dicapai melalui border dan spacing, bukan shadow besar
- Card-based layout — setiap grup informasi dalam card berborder
- Dark theme **hanya** untuk halaman map visualization dan gambar capture export

---

## Tailwind Configuration

Tambahkan token berikut ke `tailwind.config.ts`:

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand
        primary:      '#5A35F3',
        'primary-hover': '#4B2BE0',
        'primary-soft':  '#EEEAFE',

        // Surface
        canvas:        '#FFFFFF',
        'canvas-secondary': '#F8F8FA',
        card:          '#FFFFFF',
        page:          '#F2F2F6',
        border:        '#E6E6EB',
        divider:       '#EFEFF3',

        // Text
        'text-primary':   '#1F1F24',
        'text-secondary': '#6B6B76',
        'text-muted':     '#9A9AA5',
        'on-primary':     '#FFFFFF',

        // Semantic — Success
        'success-bg':   '#E7F7DF',
        'success-text': '#2D7A2D',
        'success-icon': '#4CAF50',

        // Semantic — Warning
        'warning-bg':   '#FFF3D6',
        'warning-text': '#946200',
        'warning-icon': '#F4A300',

        // Semantic — Info
        'info': '#3178F6',
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      spacing: {
        xs:      '4px',
        sm:      '8px',
        md:      '12px',
        lg:      '16px',
        xl:      '24px',
        xxl:     '32px',
        section: '48px',
      },
      fontSize: {
        display:       ['40px', { lineHeight: '1.2', fontWeight: '700' }],
        'page-title':  ['20px', { lineHeight: '1.3', fontWeight: '700' }],
        'section-title':['18px',{ lineHeight: '1.4', fontWeight: '600' }],
        'heading-sm':  ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        body:          ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        label:         ['13px', { lineHeight: '1.4', fontWeight: '500' }],
        caption:       ['12px', { lineHeight: '1.4', fontWeight: '400' }],
        micro:         ['11px', { lineHeight: '1.4', fontWeight: '400' }],
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        'elevation-1': 'none',                           // border saja
        'elevation-2': '0 2px 8px rgba(0,0,0,0.04)',    // floating panel
        'elevation-3': '0 8px 24px rgba(0,0,0,0.08)',   // modal overlay
      },
      screens: {
        mobile: '0px',
        tablet: '768px',
        laptop: '992px',
        desktop: '1200px',
      },
    },
  },
  plugins: [],
}

export default config
```

---

## Color Tokens

### Brand & Primary

| Token Tailwind | Hex | Penggunaan |
|---------------|-----|-----------|
| `bg-primary` | `#5A35F3` | CTA button background, active step indicator |
| `hover:bg-primary-hover` | `#4B2BE0` | Hover & pressed CTA |
| `bg-primary-soft` | `#EEEAFE` | Selected state background, badge subtle |
| `text-primary` (custom) | `#5A35F3` | **Jangan gunakan** — konflik dengan `text-primary` text token |

> ⚠️ **Naming conflict**: Tailwind `text-primary` biasanya merujuk text color. Di config ini, `text-primary` adalah warna teks `#1F1F24`. Untuk warna brand ungu sebagai text, gunakan `text-[#5A35F3]` atau buat alias `text-brand`.

### Surface

| Token Tailwind | Hex | Penggunaan |
|---------------|-----|-----------|
| `bg-canvas` | `#FFFFFF` | Background utama halaman |
| `bg-canvas-secondary` | `#F8F8FA` | Section sekunder, sidebar subtle |
| `bg-card` | `#FFFFFF` | Card, panel, container |
| `bg-page` | `#F2F2F6` | Outer page wrapper |
| `border-border` | `#E6E6EB` | Card border, separator |
| `border-divider` | `#EFEFF3` | Divider internal section |

### Text

| Token Tailwind | Hex | Penggunaan |
|---------------|-----|-----------|
| `text-text-primary` | `#1F1F24` | Heading, body utama |
| `text-text-secondary` | `#6B6B76` | Label, info pendukung |
| `text-text-muted` | `#9A9AA5` | Metadata, helper text |
| `text-on-primary` | `#FFFFFF` | Teks di atas permukaan ungu |

### Semantic

| Token Tailwind | Hex | Penggunaan |
|---------------|-----|-----------|
| `bg-success-bg` | `#E7F7DF` | Alert sukses background |
| `text-success-text` | `#2D7A2D` | Teks alert sukses |
| `text-success-icon` | `#4CAF50` | Icon alert sukses |
| `bg-warning-bg` | `#FFF3D6` | Alert warning background |
| `text-warning-text` | `#946200` | Teks alert warning |
| `text-warning-icon` | `#F4A300` | Icon alert warning |
| `text-info` | `#3178F6` | Link inline, info aksi |

---

## Typography

Font: **Inter** (load via `next/font/google` atau CDN).

| Token | Tailwind Class | Size / Weight | Penggunaan |
|-------|---------------|--------------|-----------|
| display | `text-display` | 40px / 700 | Hero halaman |
| page-title | `text-page-title` | 20px / 700 | Judul halaman dashboard |
| section-title | `text-section-title` | 18px / 600 | Judul card / section |
| heading-sm | `text-heading-sm` | 16px / 600 | Sub-heading, summary title |
| body | `text-body` | 14px / 400 | Konten default |
| label | `text-label` | 13px / 500 | Form label |
| caption | `text-caption` | 12px / 400 | Info sekunder |
| micro | `text-micro` | 11px / 400 | Fine print |

**Prinsip:**
- Hierarki dari weight, bukan ukuran ekstrem
- Angka/nilai numerik → `font-semibold`
- Jangan gunakan warna teks di luar token yang terdaftar

---

## Spacing

| Token | Value | Tailwind Equivalent |
|-------|-------|-------------------|
| xs | 4px | `gap-xs`, `p-xs`, `m-xs` |
| sm | 8px | `gap-sm` dst |
| md | 12px | `gap-md` dst |
| lg | 16px | `gap-lg` dst |
| xl | 24px | `gap-xl` dst (card padding) |
| xxl | 32px | `gap-xxl` dst |
| section | 48px | `gap-section` dst |

Card padding standar: `p-xl` (24px). Alert banner: `p-lg` (16px).

---

## Border Radius

| Token | Value | Tailwind Class |
|-------|-------|---------------|
| xs | 4px | `rounded-xs` |
| sm | 6px | `rounded-sm` |
| md | 8px | `rounded-md` |
| lg | 12px | `rounded-lg` |
| xl | 16px | `rounded-xl` |
| circle | 9999px | `rounded-full` |

---

## Elevation & Depth

Gunakan border terlebih dahulu. Shadow hanya untuk floating/modal.

| Level | Tailwind | Penggunaan |
|-------|----------|-----------|
| 0 | `bg-page` (flat) | Page background |
| 1 | `border border-border` | Card standar — **pakai ini sebagai default** |
| 2 | `shadow-elevation-2` | Floating panel, dropdown |
| 3 | `shadow-elevation-3` | Modal overlay, dialog |

---

## Component Patterns

### Button Primary
```tsx
// ✅ CORRECT
<button className="h-12 px-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold rounded-md transition-colors">
  Capture Sekarang
</button>

// ❌ WRONG — jangan improvisasi warna sendiri
<button className="bg-violet-600 text-white">...</button>
```

### Button Secondary
```tsx
<button className="h-12 px-xl bg-canvas border border-border text-text-primary font-semibold rounded-md hover:bg-canvas-secondary transition-colors">
  Batal
</button>
```

### Card Default
```tsx
<div className="bg-card border border-border rounded-lg p-xl">
  {/* konten */}
</div>
```

### Card Summary (sticky sidebar)
```tsx
<div className="bg-card border border-border rounded-lg p-xl sticky top-6">
  {/* summary konten */}
</div>
```

### Alert Success
```tsx
<div className="bg-success-bg text-success-text rounded-md p-lg flex items-start gap-sm">
  <CheckIcon className="text-success-icon mt-0.5 shrink-0" />
  <span className="text-body">Capture berhasil disimpan.</span>
</div>
```

### Alert Warning
```tsx
<div className="bg-warning-bg text-warning-text rounded-md p-lg flex items-start gap-sm">
  <AlertIcon className="text-warning-icon mt-0.5 shrink-0" />
  <span className="text-body">Batas captures/hari tercapai.</span>
</div>
```

### Text Input / Select
```tsx
<input className="h-11 w-full px-lg border border-border rounded-sm text-body text-text-primary bg-canvas placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft transition-colors" />
```

### Checkbox
```tsx
<input type="checkbox" className="w-5 h-5 rounded-xs border-border text-primary focus:ring-primary focus:ring-2" />
```

### Link Inline
```tsx
<a className="text-info no-underline hover:underline">Lihat detail</a>
```

### Form Label
```tsx
<label className="text-label text-text-secondary font-medium">Nama Zona</label>
```

### Badge — Road Class
```tsx
// Free
<span className="text-micro bg-canvas-secondary text-text-muted border border-border rounded-xs px-sm py-xs">Nasional</span>
// Standard
<span className="text-micro bg-primary-soft text-[#5A35F3] rounded-xs px-sm py-xs">Nasional + Provinsi</span>
// Premium
<span className="text-micro bg-success-bg text-success-text rounded-xs px-sm py-xs">Semua Jalan</span>
```

### Price Row (usage summary)
```tsx
<div className="flex justify-between items-center text-body">
  <span className="text-text-secondary">Captures hari ini</span>
  <span className="font-semibold text-text-primary">7 / 10</span>
</div>
<div className="border-t border-divider my-md" />
```

### Progress Bar (usage widget)
```tsx
// Normal
<div className="h-1.5 bg-canvas-secondary rounded-full overflow-hidden">
  <div className="h-full bg-primary rounded-full transition-all" style={{ width: '45%' }} />
</div>
// Warning (≥ 80%)
<div className="h-1.5 bg-warning-bg rounded-full overflow-hidden">
  <div className="h-full bg-warning-icon rounded-full" style={{ width: '85%' }} />
</div>
// Critical (100%)
<div className="h-1.5 bg-red-100 rounded-full overflow-hidden">
  <div className="h-full bg-red-500 rounded-full" style={{ width: '100%' }} />
</div>
```

---

## Layout

### Dashboard — Two Column
```tsx
// app/(dashboard)/layout.tsx
<div className="min-h-screen bg-page">
  <Sidebar />                          {/* fixed left, w-64 */}
  <main className="ml-64 p-xl">
    {children}
  </main>
</div>
```

### Page dengan Summary Sidebar
```tsx
<div className="grid grid-cols-[1fr_320px] gap-xl items-start">
  <div className="space-y-xl">{/* main content */}</div>
  <div>{/* sticky sidebar */}</div>
</div>
```

### Responsive
- `desktop:` (≥1200px) — 2 kolom
- `tablet:` (768–1199px) — sidebar pindah ke bawah konten utama
- `mobile:` (<768px) — single column, CTA full width

---

## Dark Theme — Map & Capture Only

Dark theme **hanya boleh digunakan** pada:
- Halaman map visualization (`/captures/[id]/map`)
- Komponen `MapVisualization`
- Output gambar capture (Playwright)

```tsx
// ✅ CORRECT — dark scope hanya di komponen map
<div className="bg-gray-950 text-white rounded-lg overflow-hidden">
  <HereMapCanvas />
</div>

// ❌ WRONG — dark di layout utama dashboard
<html className="dark">...</html>
```

---

## Do's and Don'ts

### ✅ Do
- Gunakan token Tailwind dari config — jangan hardcode hex di className
- Satu CTA primer per view — jangan dua `bg-primary` button bersebelahan
- Gunakan `border border-border` sebagai pembatas utama, bukan shadow
- Semantic alert (`bg-success-bg`, `bg-warning-bg`) untuk status state
- `font-semibold` untuk angka/nilai numerik agar mudah di-scan

### ❌ Don't
- Jangan gunakan warna Tailwind default (`violet-600`, `purple-500`, dll) — pakai token custom
- Jangan tambah aksen warna baru selain yang ada di config
- Jangan gunakan `shadow-lg` atau `shadow-xl` untuk card biasa
- Jangan taruh dua button `bg-primary` dalam satu view
- Jangan gunakan `text-red-*` kecuali untuk aksi destruktif yang nyata
- Jangan gunakan dark mode global — dark hanya untuk map

---

## File Locations

```
web/
  tailwind.config.ts          ← token config (single source of truth)
  src/
    components/
      ui/                     ← Base UI wrappers + design token components
        Button.tsx            ← button-primary, button-secondary
        Card.tsx              ← card-default, card-summary
        Alert.tsx             ← alert-success, alert-warning
        Input.tsx             ← text-input, select-input
        Badge.tsx             ← road class badge, status badge
        ProgressBar.tsx       ← usage progress bar
        PriceRow.tsx          ← price summary row
```

Semua component di `components/ui/` wajib menggunakan token dari `tailwind.config.ts`. Tidak ada hardcode hex atau Tailwind default color di dalam komponen tersebut.
