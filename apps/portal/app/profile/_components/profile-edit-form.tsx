"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import type { EditableProfileField } from "@/lib/profile/schema"
import { EDITABLE_PROFILE_FIELDS } from "@/lib/profile/schema"

import { updateMyProfile } from "../actions"
import { Section } from "./profile-ui"

const FIELDS: { key: EditableProfileField; label: string; mono?: boolean }[] = [
  { key: "chinese_name", label: "中文姓名" },
  { key: "lastName", label: "姓(英文)" },
  { key: "firstName", label: "名(英文)" },
  { key: "student_id", label: "學號", mono: true },
  { key: "phone", label: "電話", mono: true },
  { key: "position", label: "職稱" },
  { key: "gitlabUsername", label: "GitLab 帳號", mono: true },
]

export function ProfileEditForm({
  initial,
}: {
  initial: Record<EditableProfileField, string>
}) {
  const [values, setValues] = React.useState(initial)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pending, startTransition] = React.useTransition()

  const dirty = EDITABLE_PROFILE_FIELDS.some(
    (key) => values[key] !== initial[key]
  )

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const update: Record<string, string> = {}
    for (const key of EDITABLE_PROFILE_FIELDS) {
      if (values[key] !== initial[key]) update[key] = values[key]
    }
    if (Object.keys(update).length === 0) return

    startTransition(async () => {
      try {
        const result = await updateMyProfile(update)
        if (result.ok) {
          setErrors({})
          toast.success("個人資料已更新")
          return
        }
        setErrors(result.errors)
        toast.error(result.errors._form ?? "部分欄位未通過驗證")
      } catch (err) {
        // The action itself rejecting (network drop, deploy skew) escapes the
        // transition and hits the root error boundary — which would replace
        // all of /profile over a failed save. Keep it a toast.
        console.error("[profile] update action failed", err)
        toast.error("儲存失敗,請檢查網路後再試。")
      }
    })
  }

  return (
    <Section title="基本資料" description="這些欄位會寫回你的 Keycloak 帳號。">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col divide-y divide-border"
      >
        {FIELDS.map(({ key, label, mono }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <Label
              htmlFor={`profile-${key}`}
              className="shrink-0 text-xs font-normal text-muted-foreground"
            >
              {label}
            </Label>
            <div className="flex w-full max-w-[60%] flex-col items-end gap-1">
              <Input
                id={`profile-${key}`}
                value={values[key]}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [key]: event.target.value }))
                }
                className={
                  "h-8 text-right text-xs " + (mono ? "font-mono" : "")
                }
                aria-invalid={errors[key] ? true : undefined}
              />
              {errors[key] ? (
                <p className="text-xs text-destructive">{errors[key]}</p>
              ) : null}
            </div>
          </div>
        ))}
        <div className="flex items-center justify-end px-4 py-3">
          <Button type="submit" size="sm" disabled={!dirty || pending}>
            {pending ? "儲存中…" : "儲存變更"}
          </Button>
        </div>
      </form>
    </Section>
  )
}
