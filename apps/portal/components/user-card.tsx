import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

type UserCardProps = {
  name: string
  email: string | null
  avatarUrl: string | null
}

export function UserCard({ name, email, avatarUrl }: UserCardProps) {
  const initials =
    name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"

  return (
    <div className="flex items-center gap-3">
      <Avatar size="lg">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        {email ? (
          <span className="truncate text-xs text-muted-foreground">
            {email}
          </span>
        ) : null}
      </div>
    </div>
  )
}
