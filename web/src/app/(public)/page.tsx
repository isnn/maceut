import Link from 'next/link'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { TrafficSchematic } from '@/components/shared/TrafficSchematic'
import { PlanCards } from '@/features/marketing/components/PlanCards'

const SERVICES = [
  {
    title: 'Koleksi zona',
    body: 'Gambar batas area di peta, lalu pilih kelas jalan yang ingin dikumpulkan.',
  },
  {
    title: 'Jendela capture',
    body: 'Jadwal berulang per zona — jam sibuk, hari kerja, atau sekali jalan.',
  },
  {
    title: 'Studio replay',
    body: 'Animasikan frame tersimpan dan bandingkan dua momen berdampingan.',
  },
  {
    title: 'Ekspor & API',
    body: 'CSV per jendela, atau tarik frame langsung ke sistem Anda sendiri.',
  },
]

export default function LandingPage() {
  return (
    <>
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-[1180px] px-xl py-section grid grid-cols-1 laptop:grid-cols-2 gap-xxl items-center">
          <div>
            <span className="inline-block bg-primary-soft text-[#5A35F3] text-micro font-semibold uppercase tracking-wide rounded-xs px-sm py-xs">
              Untuk instansi jalan Indonesia
            </span>
            <h1 className="mt-lg text-[40px] leading-[1.1] font-extrabold tracking-tight text-text-primary text-balance">
              Ubah jaringan jalan apa pun jadi data lalu lintas yang bisa dijadwalkan.
            </h1>
            <p className="mt-lg text-body text-text-secondary max-w-[46ch]">
              Gambar sebuah zona, pilih kelas jalan yang Anda pedulikan, dan tentukan jendela waktu yang ingin
              di-capture. Maceut mengumpulkan, menyimpan, dan memutar ulang setiap frame.
            </p>
            <div className="mt-xl flex flex-wrap gap-md">
              <Link
                href="/register"
                className="h-12 px-xl inline-flex items-center bg-primary hover:bg-primary-hover text-on-primary font-semibold rounded-md no-underline transition-colors"
              >
                Buat akun gratis
              </Link>
              <a
                href="#support"
                className="h-12 px-xl inline-flex items-center bg-canvas border border-border text-text-primary font-semibold rounded-md no-underline hover:bg-canvas-secondary transition-colors"
              >
                Jadwalkan demo
              </a>
            </div>
            <p className="mt-lg flex flex-wrap gap-lg text-caption text-text-muted">
              <span>Paket Free — 1 zona, 10 capture / hari</span>
              <span>Tanpa kartu kredit</span>
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-lg shadow-elevation-2">
            <div className="flex items-center gap-sm mb-md">
              <span className="bg-primary-soft text-[#5A35F3] text-micro font-semibold rounded-xs px-sm py-xs">PLACEHOLDER</span>
              <span className="text-caption text-text-secondary">Screenshot produk menyusul saat build</span>
            </div>
            <div className="rounded-md overflow-hidden border border-divider">
              <TrafficSchematic showBoundary />
            </div>
            <div className="mt-md flex items-end justify-between">
              <div>
                <p className="text-label text-text-secondary">Koridor Sudirman</p>
                <p className="text-page-title font-bold text-text-primary">18,4 km/jam</p>
              </div>
              <span className="bg-danger-bg text-danger-text text-micro font-semibold rounded-xs px-sm py-xs">
                Macet · jendela 07:30
              </span>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="produk" className="border-t border-border bg-canvas-secondary">
          <div className="mx-auto max-w-[1180px] px-xl py-section">
            <p className="text-label text-text-secondary">Apa yang Maceut kerjakan</p>
            <h2 className="mt-xs text-page-title font-bold text-text-primary">Empat layanan, satu workspace.</h2>
            <div className="mt-xl grid grid-cols-1 tablet:grid-cols-2 laptop:grid-cols-4 gap-lg">
              {SERVICES.map((service, i) => (
                <div key={service.title} className="bg-card border border-border rounded-lg p-xl">
                  <span className="text-micro font-semibold text-text-muted tabular-nums">0{i + 1}</span>
                  <h3 className="mt-sm text-heading-sm text-text-primary">{service.title}</h3>
                  <p className="mt-sm text-body text-text-secondary">{service.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Plans */}
        <section id="harga" className="border-t border-border">
          <div className="mx-auto max-w-[1180px] px-xl py-section">
            <div className="flex flex-wrap items-end justify-between gap-md mb-xl">
              <div>
                <p className="text-label text-text-secondary">Paket</p>
                <h2 className="mt-xs text-page-title font-bold text-text-primary">
                  Naik paket kapan saja — zona dan jendela ikut bertambah.
                </h2>
              </div>
              <Link href="/register" className="text-info text-body no-underline hover:underline">
                Bandingkan semua fitur
              </Link>
            </div>
            <PlanCards />
          </div>
        </section>

        {/* Closing */}
        <section id="support" className="border-t border-border bg-primary">
          <div className="mx-auto max-w-[1180px] px-xl py-section flex flex-wrap items-center justify-between gap-xl">
            <div>
              <h2 className="text-page-title font-bold text-on-primary">Mulai dari satu zona hari ini.</h2>
              <p className="mt-sm text-body text-on-primary/80">
                Paket Free tidak butuh kartu kredit. Naik paket saat butuh zona atau capture lebih banyak.
              </p>
            </div>
            <Link
              href="/register"
              className="h-12 px-xl inline-flex items-center bg-canvas text-text-primary font-semibold rounded-md no-underline hover:bg-canvas-secondary transition-colors"
            >
              Buat akun gratis
            </Link>
          </div>
        </section>
      </main>

      <footer id="docs" className="border-t border-border">
        <div className="mx-auto max-w-[1180px] px-xl py-xl flex flex-wrap items-center justify-between gap-md">
          <p className="text-caption text-text-muted">© 2026 Maceut — monitoring kemacetan berbasis peta.</p>
          <p className="text-caption text-text-muted">Dipakai instansi jalan provinsi dan kota di Jawa dan Sumatra.</p>
        </div>
      </footer>
    </>
  )
}
