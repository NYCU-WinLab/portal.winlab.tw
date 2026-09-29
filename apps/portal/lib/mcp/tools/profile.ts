import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  DOOR_SOUND_MAX_BYTES,
  DOOR_SOUND_MAX_SECONDS,
  DOOR_SOUND_MODE_LABELS,
  DOOR_SOUND_MODES,
  DOOR_SOUND_TYPES,
  doorSoundOutcome,
  type DoorSoundExtension,
} from "@/lib/door/sound"
import {
  decodeBase64,
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type Caller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"
import { setOwnDoorSound, type DoorSoundBytes } from "@/lib/profile/door-sound"
import { fetchProfileStats } from "@/lib/profile/fetch"
import {
  getProfileFields,
  type ProfileFieldsResult,
} from "@/lib/profile/keycloak"

export type KeycloakAccount = {
  chinese_name: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  position: string | null
  gitlab_username: string | null
  student_id: string | null
}

// Keycloak stores an absent attribute as the empty string once the field
// exists on the realm's user profile, which would read as "their name is
// nothing"; null says "not filled in".
export function keycloakAccount(
  result: ProfileFieldsResult
): KeycloakAccount | null {
  if (result.status !== "ok") return null
  const p = result.profile
  const value = (raw: string) => (raw.length > 0 ? raw : null)
  return {
    chinese_name: value(p.chinese_name),
    first_name: value(p.firstName),
    last_name: value(p.lastName),
    phone: value(p.phone),
    position: value(p.position),
    gitlab_username: value(p.gitlabUsername),
    student_id: value(p.student_id),
  }
}

const DOOR_SOUND_FORMATS = Object.keys(DOOR_SOUND_TYPES) as DoorSoundExtension[]

export type ProfileHooks = {
  // Runs after a door sound save, like saveDoorSound's after(): remove the
  // replaced file and have the door panel fetch greetings again.
  afterDoorSoundSave?: (
    caller: Caller,
    files: { keep: string | null; previous: string | null }
  ) => void
}

// format and file_base64 travel as a pair: both to upload a new sound, neither
// to change only the mode.
export function doorSoundFile(
  format: DoorSoundExtension | undefined,
  fileBase64: string | undefined
): DoorSoundBytes | undefined {
  if (format === undefined && fileBase64 === undefined) return undefined
  if (format === undefined || fileBase64 === undefined) {
    throw new Error(
      "format and file_base64 go together: pass both to upload a sound, or neither to change only the mode"
    )
  }
  return { ext: format, bytes: decodeBase64(fileBase64, DOOR_SOUND_MAX_BYTES) }
}

export function registerProfileTools(
  server: McpServer,
  hooks: ProfileHooks = {}
) {
  server.registerTool(
    "get_profile",
    {
      title: "Get profile",
      description:
        "The member's own /profile page as data: their Keycloak account fields (Chinese name, English name, student id, phone, position, GitLab username) plus the portal activity stats that page shows — bento orders and spending, leave days taken, approve documents created and signed with the average signing delay, and trip files uploaded. Self only, and not a directory: get_profile_stats returns nothing for any user id but the caller's, so there is no way to read another member's profile here. keycloak is null when the member has no Keycloak identity or the IdP is unreachable, and the stats still come back.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const stats = await fetchProfileStats(supabase, caller.userId)
        const account: ProfileFieldsResult = caller.keycloakSub
          ? await getProfileFields(caller.keycloakSub)
          : { status: "unconfigured" }
        return json({
          user_id: caller.userId,
          url: `${PORTAL_URL}/profile`,
          keycloak: keycloakAccount(account),
          stats,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "set_door_sound",
    {
      title: "Set door sound",
      description: `Set what the lab door plays when the member opens it, the 開門音效 setting on /profile. Self only. The door first says "Hi" with the member's given name and the words of their greeting suffix (symbols are not spoken), then plays the sound. Send an audio file as base64 (mp3, m4a, aac, wav or ogg, max 3 MB decoded) to replace the member's sound; the door plays at most its first ${DOOR_SOUND_MAX_SECONDS} seconds, loudness levelled. mode sound_only (播我的音效) plays the member's file, voice_only (播預設音效) plays the lab's default sound and keeps the file. Pass format and file_base64 together, or neither to change only the mode. The replaced file is deleted and the door picks up the change within seconds. Confirm with the member before replacing their sound.`,
      inputSchema: z.object({
        mode: z
          .enum(DOOR_SOUND_MODES)
          .default("sound_only")
          .describe("sound_only = 播我的音效, voice_only = 播預設音效"),
        format: z
          .enum(DOOR_SOUND_FORMATS)
          .optional()
          .describe("File type of file_base64"),
        file_base64: z
          .string()
          .min(1)
          .optional()
          .describe("Audio file contents, base64"),
      }),
    },
    async ({ mode, format, file_base64 }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const file = doorSoundFile(format, file_base64)
        const supabase = createUserClient(caller.token)
        const result = await setOwnDoorSound(supabase, caller.userId, {
          mode,
          file,
        })
        if (!result.ok) return failure(result.error)
        hooks.afterDoorSoundSave?.(caller, {
          keep: result.path,
          previous: result.previous ?? null,
        })
        return json({
          mode: result.mode,
          mode_label: DOOR_SOUND_MODE_LABELS[result.mode],
          plays: doorSoundOutcome({
            mode: result.mode,
            hasFile: result.path !== null,
          }),
          uploaded: file !== undefined,
          url: `${PORTAL_URL}/profile`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
