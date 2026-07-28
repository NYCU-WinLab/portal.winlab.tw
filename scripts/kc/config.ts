// Credential resolution for the `kc` tool.
//
// Two profiles, deliberately split by blast radius (see
// docs/keycloak/2026-07-28-keycloak-26.7-admin-api-research.md §6):
//
//   cli  — view-users only. The default. What this machine and any coding
//          agent uses. A leak cannot mutate the realm.
//   app  — manage-users. The same credential the deployed portal uses for
//          /profile self-service edits. Only reachable via `--profile app`.
//
// Nothing here ever returns a secret to a caller that wants to print it —
// use `redactor()` on any string headed for stdout.

import { homedir } from "node:os"
import { join } from "node:path"

export type ProfileName = "cli" | "app"

export type Credentials = {
  clientId: string
  clientSecret: string
}

export type Config = {
  url: string
  realm: string
  profile: ProfileName
  credentials: Credentials | null
  bootstrap: BootstrapCredentials | null
  /** Where each key was resolved from, for `doctor` to report. Never values. */
  provenance: Record<string, string>
  /** Every secret seen, so output can be scrubbed. */
  secrets: string[]
}

export type BootstrapCredentials = {
  realm: string
  clientId: string
  username: string
  password: string
}

const CONFIG_PATH = join(homedir(), ".config", "winlab", "keycloak.env")

export function defaultConfigPath(): string {
  return CONFIG_PATH
}

// Files are read in increasing precedence: later wins, and the real process
// environment beats all of them. Missing files are not an error — a machine
// that only exports env vars is a valid setup.
function envFiles(): string[] {
  const files = [
    join(process.cwd(), "apps", "portal", ".env.local"),
    CONFIG_PATH,
  ]
  const override = process.env.WINLAB_KC_ENV
  if (override) files.push(override)
  return files
}

// Deliberately minimal: KEY=VALUE, optional quotes, `#` comments, no
// interpolation. A dotenv dependency would be a bigger surface than the
// twelve lines it replaces.
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key.length > 0) out[key] = value
  }
  return out
}

async function readEnvFiles(): Promise<{
  values: Record<string, string>
  provenance: Record<string, string>
}> {
  const values: Record<string, string> = {}
  const provenance: Record<string, string> = {}

  for (const path of envFiles()) {
    const file = Bun.file(path)
    if (!(await file.exists())) continue
    const parsed = parseEnvFile(await file.text())
    for (const [key, value] of Object.entries(parsed)) {
      values[key] = value
      provenance[key] = path
    }
  }

  for (const key of Object.keys(process.env)) {
    if (!key.startsWith("KEYCLOAK_")) continue
    const value = process.env[key]
    if (value === undefined || value.length === 0) continue
    values[key] = value
    provenance[key] = "process environment"
  }

  return { values, provenance }
}

function credentialsFor(
  values: Record<string, string>,
  profile: ProfileName
): Credentials | null {
  const prefix =
    profile === "cli" ? "KEYCLOAK_CLI_CLIENT" : "KEYCLOAK_ADMIN_CLIENT"
  const clientId = values[`${prefix}_ID`]
  const clientSecret = values[`${prefix}_SECRET`]
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

function bootstrapFor(
  values: Record<string, string>
): BootstrapCredentials | null {
  const username = values.KEYCLOAK_BOOTSTRAP_USERNAME
  const password = values.KEYCLOAK_BOOTSTRAP_PASSWORD
  if (!username || !password) return null
  return {
    // The admin account almost always lives in `master`, but a realm-scoped
    // admin works too and is the smaller credential — allow both.
    realm: values.KEYCLOAK_BOOTSTRAP_REALM ?? "master",
    clientId: values.KEYCLOAK_BOOTSTRAP_CLIENT_ID ?? "admin-cli",
    username,
    password,
  }
}

export async function loadConfig(profile: ProfileName): Promise<Config> {
  const { values, provenance } = await readEnvFiles()
  const credentials = credentialsFor(values, profile)
  const bootstrap = bootstrapFor(values)

  const secrets = [
    credentials?.clientSecret,
    bootstrap?.password,
    values.KEYCLOAK_CLI_CLIENT_SECRET,
    values.KEYCLOAK_ADMIN_CLIENT_SECRET,
  ].filter((s): s is string => typeof s === "string" && s.length > 0)

  return {
    url: (values.KEYCLOAK_URL ?? "").replace(/\/+$/, ""),
    realm: values.KEYCLOAK_REALM ?? "",
    profile,
    credentials,
    bootstrap,
    provenance,
    secrets,
  }
}

// Belt and braces: every command routes its output through this, so a secret
// echoed back inside a Keycloak error body can't reach a terminal or a
// transcript. Longest-first so overlapping secrets scrub completely.
export function redactor(secrets: string[]): (text: string) => string {
  const ordered = [...new Set(secrets)]
    .filter((s) => s.length >= 8)
    .sort((a, b) => b.length - a.length)
  return (text: string) => {
    let out = text
    for (const secret of ordered) out = out.split(secret).join("«redacted»")
    return out
  }
}
