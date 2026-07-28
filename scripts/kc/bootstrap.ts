// `kc bootstrap` — provision the two service-account clients over the Admin
// REST API, so nobody has to click through the Keycloak admin console.
//
// The one thing this cannot invent is its own authority: creating a client
// requires a credential that can already create clients. Supply a Keycloak
// admin login once via KEYCLOAK_BOOTSTRAP_USERNAME / _PASSWORD (password
// grant through the built-in `admin-cli` client), let this run, then delete
// those two lines. Everything afterwards runs on the service accounts.
//
// Creating clients in a shared realm is outward-facing and not trivially
// reversible, so the default is a dry run. `--apply` is the deliberate step.

import { chmod, mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import type { Config } from "./config"
import { parseEnvFile, redactor } from "./config"
import {
  AdminApi,
  KeycloakError,
  findProfileAttribute,
  passwordToken,
  unmanagedPolicy,
  type UserProfileConfig,
} from "./keycloak"
import { Report, describeError } from "./report"

type ClientSpec = {
  clientId: string
  name: string
  description: string
  /** realm-management role to grant the service account. */
  role: string
  /** Which env var pair this client's credentials land in. */
  envPrefix: string
}

// Split by blast radius, per the research record §6. The cli credential is
// read-only by construction: a leaked laptop secret cannot mutate the realm,
// and revoking it cannot take the deployed portal down.
const CLIENTS: ClientSpec[] = [
  {
    clientId: "winlab-portal-admin",
    name: "WinLab Portal (admin API)",
    description:
      "Service account for portal.winlab.tw — /profile self-service edits and user attribute writes.",
    role: "manage-users",
    envPrefix: "KEYCLOAK_ADMIN_CLIENT",
  },
  {
    clientId: "winlab-kc-cli",
    name: "WinLab Keycloak CLI (read-only)",
    description:
      "Read-only service account for local tooling and coding agents. view-users only.",
    role: "view-users",
    envPrefix: "KEYCLOAK_CLI_CLIENT",
  },
]

type ClientRepresentation = {
  id?: string
  clientId: string
  name?: string
  description?: string
  protocol?: string
  enabled?: boolean
  publicClient?: boolean
  serviceAccountsEnabled?: boolean
  standardFlowEnabled?: boolean
  directAccessGrantsEnabled?: boolean
  implicitFlowEnabled?: boolean
  fullScopeAllowed?: boolean
}

type RoleRepresentation = { id: string; name: string }

function desiredRepresentation(spec: ClientSpec): ClientRepresentation {
  return {
    clientId: spec.clientId,
    name: spec.name,
    description: spec.description,
    protocol: "openid-connect",
    enabled: true,
    // Confidential + service accounts is exactly the client_credentials shape.
    publicClient: false,
    serviceAccountsEnabled: true,
    // A machine credential has no business doing browser or password logins.
    standardFlowEnabled: false,
    directAccessGrantsEnabled: false,
    implicitFlowEnabled: false,
    // Docs: full scope is "useful only for the development purposes".
    fullScopeAllowed: false,
  }
}

export type BootstrapOptions = {
  apply: boolean
  attribute?: string
  configPath: string
}

export async function bootstrap(
  config: Config,
  options: BootstrapOptions
): Promise<number> {
  const report = new Report(redactor(config.secrets))

  if (!config.url || !config.realm) {
    report.fail(
      "KEYCLOAK_URL and KEYCLOAK_REALM must both be set before bootstrapping",
      `Put them in ${options.configPath} first.`
    )
    return report.summary()
  }
  if (!config.bootstrap) {
    report.fail(
      "No bootstrap credentials",
      `Add KEYCLOAK_BOOTSTRAP_USERNAME and KEYCLOAK_BOOTSTRAP_PASSWORD to ${options.configPath} (a Keycloak admin account that can create clients in realm "${config.realm}"). Delete them once this has run.`
    )
    return report.summary()
  }

  report.heading(
    options.apply
      ? `Provisioning realm "${config.realm}" at ${config.url}`
      : `Plan for realm "${config.realm}" at ${config.url} (dry run — pass --apply to execute)`
  )

  let token: string
  try {
    const result = await passwordToken(
      config.url,
      config.bootstrap.realm,
      config.bootstrap.clientId,
      config.bootstrap.username,
      config.bootstrap.password
    )
    token = result.accessToken
    report.ok(
      `Authenticated as ${config.bootstrap.username} in realm "${config.bootstrap.realm}"`
    )
  } catch (err) {
    const status = err instanceof KeycloakError ? err.status : 0
    report.fail(
      "Bootstrap login failed",
      status === 401
        ? "401 — wrong username/password, or the account has OTP configured (the password grant cannot satisfy OTP). With OTP enabled the only route is creating one client by hand in the console."
        : status === 400
          ? `400 — client "${config.bootstrap.clientId}" may not allow direct access grants in realm "${config.bootstrap.realm}".`
          : describeError(err)
    )
    return report.summary()
  }

  const api = new AdminApi(config.url, config.realm, token)

  const rmId = await realmManagementId(api, report)
  if (!rmId) return report.summary()

  const secrets: Record<string, string> = {}
  for (const spec of CLIENTS) {
    report.heading(`Client: ${spec.clientId}  (${spec.role})`)
    const secret = await provisionClient(api, spec, rmId, options.apply, report)
    if (secret) secrets[spec.envPrefix] = secret
  }

  if (options.attribute) {
    report.heading(`User profile attribute: ${options.attribute}`)
    await provisionAttribute(api, options.attribute, options.apply, report)
  }

  if (options.apply && Object.keys(secrets).length > 0) {
    report.heading("Credentials")
    await writeConfigFile(config, secrets, options.configPath, report)
  }

  if (!options.apply) {
    report.heading("Nothing was changed")
    report.info("Re-run with --apply to execute the plan above.")
  }

  return report.summary()
}

async function realmManagementId(
  api: AdminApi,
  report: Report
): Promise<string | null> {
  try {
    const clients = await api.get<ClientRepresentation[]>(
      "/clients?clientId=realm-management"
    )
    const id = clients[0]?.id
    if (!id) {
      report.fail("No realm-management client in this realm")
      return null
    }
    return id
  } catch (err) {
    const status = err instanceof KeycloakError ? err.status : 0
    report.fail(
      "Could not read the realm's clients",
      status === 403
        ? "403 — the bootstrap account cannot administer this realm."
        : describeError(err)
    )
    return null
  }
}

async function provisionClient(
  api: AdminApi,
  spec: ClientSpec,
  realmManagementUuid: string,
  apply: boolean,
  report: Report
): Promise<string | null> {
  const desired = desiredRepresentation(spec)

  let existing: ClientRepresentation | undefined
  try {
    const found = await api.get<ClientRepresentation[]>(
      `/clients?clientId=${encodeURIComponent(spec.clientId)}`
    )
    existing = found[0]
  } catch (err) {
    report.fail(`Could not look up ${spec.clientId}`, describeError(err))
    return null
  }

  if (!apply) {
    report.info(
      existing
        ? `would update existing client (settings reconciled, secret left alone)`
        : `would create confidential client with service accounts enabled`
    )
    report.info(`would grant realm-management → ${spec.role}`)
    report.info(`would store credentials as ${spec.envPrefix}_ID / _SECRET`)
    return null
  }

  let uuid: string
  try {
    if (existing?.id) {
      await api.put(`/clients/${existing.id}`, { ...existing, ...desired })
      uuid = existing.id
      report.ok("Client existed — settings reconciled, secret preserved")
    } else {
      await api.post("/clients", desired)
      const created = await api.get<ClientRepresentation[]>(
        `/clients?clientId=${encodeURIComponent(spec.clientId)}`
      )
      const id = created[0]?.id
      if (!id) {
        report.fail("Client was created but could not be read back")
        return null
      }
      uuid = id
      report.ok("Client created")
    }
  } catch (err) {
    report.fail(`Could not write ${spec.clientId}`, describeError(err))
    return null
  }

  try {
    const serviceAccount = await api.get<{ id: string; username?: string }>(
      `/clients/${uuid}/service-account-user`
    )
    const role = await api.get<RoleRepresentation>(
      `/clients/${realmManagementUuid}/roles/${encodeURIComponent(spec.role)}`
    )
    // Idempotent: Keycloak ignores a mapping that is already present.
    await api.post(
      `/users/${serviceAccount.id}/role-mappings/clients/${realmManagementUuid}`,
      [{ id: role.id, name: role.name }]
    )
    report.ok(`Granted realm-management → ${spec.role}`)
  } catch (err) {
    report.fail("Could not assign the role", describeError(err))
    return null
  }

  try {
    const credential = await api.get<{ value?: string }>(
      `/clients/${uuid}/client-secret`
    )
    if (!credential.value) {
      report.fail("Client has no secret — is it really confidential?")
      return null
    }
    report.ok("Read client secret (not shown)")
    return credential.value
  } catch (err) {
    report.fail("Could not read the client secret", describeError(err))
    return null
  }
}

// Declaring the attribute as *managed* beats flipping the realm's unmanaged
// policy to ENABLED: it survives Keycloak's strict default without widening
// anything else, and the docs explicitly recommend against ENABLED.
async function provisionAttribute(
  api: AdminApi,
  name: string,
  apply: boolean,
  report: Report
) {
  let profile: UserProfileConfig
  try {
    profile = await api.get<UserProfileConfig>("/users/profile")
  } catch (err) {
    report.fail("Could not read the user profile config", describeError(err))
    return
  }

  const existing = findProfileAttribute(profile, name)
  if (existing) {
    const view = existing.permissions?.view ?? []
    const edit = existing.permissions?.edit ?? []
    if (view.includes("admin") || edit.includes("admin")) {
      report.ok(`Already declared and admin-readable (policy left untouched)`)
    } else {
      report.warn(
        "Declared but not admin-readable",
        `permissions.view is [${view.join(", ")}]. Not changing an attribute someone else configured — add "admin" by hand if that is intended.`
      )
    }
    return
  }

  report.info(
    `Currently unmanaged; realm policy is ${unmanagedPolicy(profile)}${
      unmanagedPolicy(profile) === "DISABLED"
        ? " (so it is invisible to the Admin API today)"
        : ""
    }`
  )

  if (!apply) {
    report.info(
      `would declare "${name}" as a managed attribute with view/edit = ["admin"]`
    )
    return
  }

  const next: UserProfileConfig = {
    ...profile,
    attributes: [
      ...(profile.attributes ?? []),
      {
        name,
        displayName: name,
        permissions: { view: ["admin"], edit: ["admin"] },
        annotations: { inputType: "text" },
      },
    ],
  }

  try {
    await api.put("/users/profile", next)
    report.ok(`Declared "${name}" as a managed attribute (admin view + edit)`)
  } catch (err) {
    report.fail("Could not update the user profile config", describeError(err))
  }
}

// Merge rather than overwrite: this file is hand-edited (it is how the
// bootstrap credentials got here in the first place), so anything we did not
// put there stays. The one deliberate removal is KEYCLOAK_BOOTSTRAP_*, which
// has served its purpose by the time this runs.
async function writeConfigFile(
  config: Config,
  secrets: Record<string, string>,
  path: string,
  report: Report
) {
  let previous: Record<string, string> = {}
  const file = Bun.file(path)
  if (await file.exists()) {
    previous = parseEnvFile(await file.text())
  }

  const merged: Record<string, string> = { ...previous }
  merged.KEYCLOAK_URL = config.url
  merged.KEYCLOAK_REALM = config.realm
  for (const spec of CLIENTS) {
    const secret = secrets[spec.envPrefix]
    if (!secret) continue
    merged[`${spec.envPrefix}_ID`] = spec.clientId
    merged[`${spec.envPrefix}_SECRET`] = secret
  }

  const dropped = Object.keys(merged).filter((k) =>
    k.startsWith("KEYCLOAK_BOOTSTRAP_")
  )
  for (const key of dropped) delete merged[key]

  const lines = [
    "# Managed by `bun run kc bootstrap --apply`; hand-edits to other keys are preserved.",
    "# Two profiles, split by blast radius:",
    "#   KEYCLOAK_CLI_*   — view-users only. Default for local tooling and agents.",
    "#   KEYCLOAK_ADMIN_* — manage-users. The credential the deployed portal uses.",
    "",
    ...Object.entries(merged).map(([key, value]) => `${key}=${value}`),
    "",
  ]

  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await writeFile(path, lines.join("\n"), { mode: 0o600 })
    await chmod(path, 0o600)
    report.ok(`Wrote ${path} (mode 0600)`)
    if (dropped.length > 0) {
      report.ok(
        `Removed ${dropped.join(", ")} — the admin login is no longer needed`
      )
    }
    report.info(
      "Remaining manual step: the deployed portal needs KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN_CLIENT_ID and KEYCLOAK_ADMIN_CLIENT_SECRET in its hosting environment — that is outside Keycloak and cannot be provisioned from here."
    )
  } catch (err) {
    report.fail(`Could not write ${path}`, describeError(err))
  }
}
