export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-canvas flex flex-col">{children}</div>
}
