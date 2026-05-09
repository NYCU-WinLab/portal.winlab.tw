import { Toaster } from "@workspace/ui/components/sonner"

export default function BulletinLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
