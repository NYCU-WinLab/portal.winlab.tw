import { parseMentions } from "@/lib/gallery/mentions"
import type { GalleryMember } from "@/lib/gallery/types"

function buildKnownMentionNames(members: GalleryMember[]): Set<string> {
  const names = new Set<string>()
  for (const member of members) {
    const trimmed = member.name?.trim()
    if (trimmed) names.add(trimmed.toLowerCase())
  }
  return names
}

function isKnownMention(name: string, knownLower: Set<string>): boolean {
  return knownLower.has(name.toLowerCase())
}

export function isGalleryMemberMention(
  name: string,
  members: GalleryMember[]
): boolean {
  return buildKnownMentionNames(members).has(name.toLowerCase())
}

export function FormattedCommentMentions({
  content,
  members,
}: {
  content: string
  members: GalleryMember[]
}) {
  const mentionNames = parseMentions(content)
  const knownLower = buildKnownMentionNames(members)

  if (mentionNames.length === 0) return <>{content}</>

  const parts = content.split(/(@[\p{L}\p{N}._-]+)/gu)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const name = part.slice(1)
          if (isKnownMention(name, knownLower)) {
            return (
              <span
                key={i}
                className="rounded bg-blue-500/15 px-1 py-0.5 text-blue-700 dark:text-blue-300"
              >
                {part}
              </span>
            )
          }
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
