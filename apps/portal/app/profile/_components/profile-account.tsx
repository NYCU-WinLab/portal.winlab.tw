import { IconExternalLink } from "@tabler/icons-react"

import type { ProfileField } from "@/lib/profile/schema"

import { FieldRow, Section } from "./profile-ui"

const FIELDS: { key: ProfileField; label: string; mono?: boolean }[] = [
  { key: "chinese_name", label: "中文姓名" },
  { key: "lastName", label: "姓(英文)" },
  { key: "firstName", label: "名(英文)" },
  { key: "student_id", label: "學號", mono: true },
  { key: "phone", label: "電話", mono: true },
  { key: "position", label: "職稱" },
  { key: "gitlabUsername", label: "GitLab 帳號", mono: true },
]

/**
 * Shows the member their Keycloak account fields, and sends them to Keycloak
 * to change any of them.
 *
 * The portal used to host this form and write back through a service account
 * holding `manage-users` — realm-wide power, including resetting anyone's
 * password, in exchange for one form. Keycloak already ships an Account
 * Console that enforces the realm's own per-attribute permissions, so the
 * editing moved there and the write credential went away entirely (#416).
 */
export function ProfileAccount({
  profile,
  accountUrl,
}: {
  profile: Record<ProfileField, string>
  accountUrl: string | null
}) {
  return (
    <Section
      title="基本資料"
      description="這些欄位存在 Keycloak 帳號上,要修改請前往 Keycloak 帳號設定。"
    >
      {FIELDS.map(({ key, label, mono }) => (
        <FieldRow key={key} label={label} value={profile[key]} mono={mono} />
      ))}
      {accountUrl ? (
        <div className="flex items-center justify-end px-4 py-3">
          <a
            href={accountUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            前往 Keycloak 帳號設定
            <IconExternalLink className="h-3 w-3" />
          </a>
        </div>
      ) : null}
    </Section>
  )
}
