import { IconPaperclip } from "@tabler/icons-react"

export function FileCell({ link }: { link: string | null }) {
  if (!link) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex justify-center text-muted-foreground hover:text-foreground"
    >
      <IconPaperclip className="h-3.5 w-3.5" />
    </a>
  )
}
