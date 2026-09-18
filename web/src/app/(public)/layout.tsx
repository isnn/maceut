export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-lg">
      <div className="w-full max-w-[28rem]">
        <div className="text-center mb-xl">
          <span className="text-page-title text-text-primary">Maceut</span>
        </div>
        <div className="bg-card border border-border rounded-lg p-xl">{children}</div>
      </div>
    </div>
  )
}
