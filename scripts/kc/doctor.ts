// `kc doctor` — answer "why is this not working" in one command.
//
// Ordered so the first failure is the real one: config, then token, then
// roles, then the user-profile gate, then an actual read. Each check names
// the fix rather than just the symptom, because the failure modes here are
// mostly silent (see the research record §1).

import type { Config } from "./config"
import { defaultConfigPath, redactor } from "./config"
import {
  AdminApi,
  KeycloakError,
  findProfileAttribute,
  realmManagementRoles,
  serviceAccountToken,
  unmanagedPolicy,
  type UserProfileConfig,
  type UserRepresentation,
} from "./keycloak"
import { Report, describeError } from "./report"

export type DoctorOptions = {
  attribute?: string
  user?: string
}

/** What each profile is supposed to be able to do. Read the research §2.1. */
const REQUIRED_ROLE: Record<string, string> = {
  cli: "view-users",
  app: "manage-users",
}

export async function doctor(
  config: Config,
  options: DoctorOptions
): Promise<number> {
  const report = new Report(redactor(config.secrets))

  report.heading(`Configuration (profile: ${config.profile})`)
  if (!checkConfig(config, report)) return report.summary()

  report.heading("Authentication")
  const token = await checkToken(config, report)
  if (!token) return report.summary()

  report.heading("Permissions")
  checkRoles(config, token, report)

  const api = new AdminApi(config.url, config.realm, token)

  report.heading("Realm access")
  const canRead = await checkUserRead(api, report)

  report.heading("User profile (the attribute gate)")
  const profile = await checkUserProfile(api, report, options.attribute)

  if (options.user && canRead) {
    report.heading(`Sample user: ${options.user}`)
    await checkSampleUser(api, report, options.user, options.attribute, profile)
  }

  return report.summary()
}

function checkConfig(config: Config, report: Report): boolean {
  const where = (key: string) => config.provenance[key] ?? "not set"

  if (!config.url) {
    report.fail(
      "KEYCLOAK_URL is not set",
      `Add it to ${defaultConfigPath()} — no trailing slash, no /auth prefix.`
    )
  } else {
    report.ok(`KEYCLOAK_URL = ${config.url}`, `from ${where("KEYCLOAK_URL")}`)
  }

  if (!config.realm) {
    report.fail(
      "KEYCLOAK_REALM is not set",
      "The realm the portal authenticates against — not `master`."
    )
  } else {
    report.ok(
      `KEYCLOAK_REALM = ${config.realm}`,
      `from ${where("KEYCLOAK_REALM")}`
    )
  }

  const prefix =
    config.profile === "cli" ? "KEYCLOAK_CLI_CLIENT" : "KEYCLOAK_ADMIN_CLIENT"
  if (!config.credentials) {
    report.fail(
      `${prefix}_ID / ${prefix}_SECRET are not both set`,
      config.bootstrap
        ? "Bootstrap credentials are present — run `kc bootstrap` to provision this client."
        : `Add them to ${defaultConfigPath()}, or supply KEYCLOAK_BOOTSTRAP_USERNAME/PASSWORD and run \`kc bootstrap\`.`
    )
  } else {
    report.ok(
      `${prefix}_ID = ${config.credentials.clientId}`,
      `secret from ${where(`${prefix}_SECRET`)}`
    )
  }

  return Boolean(config.url && config.realm && config.credentials)
}

async function checkToken(
  config: Config,
  report: Report
): Promise<string | null> {
  const { clientId, clientSecret } = config.credentials!
  try {
    const { accessToken, expiresIn } = await serviceAccountToken(
      config.url,
      config.realm,
      clientId,
      clientSecret
    )
    report.ok(
      `client_credentials token issued (expires_in ${expiresIn}s)`,
      expiresIn > 0
        ? undefined
        : "No expires_in in the response — cache defensively."
    )
    return accessToken
  } catch (err) {
    const status = err instanceof KeycloakError ? err.status : 0
    report.fail(
      "Could not obtain a token",
      status === 401
        ? "401 — wrong client secret, or the client is not confidential (Client authentication must be On)."
        : status === 400
          ? "400 — the client exists but Service accounts roles is probably Off, so client_credentials is rejected."
          : status === 404
            ? "404 — realm not found at this URL. Check KEYCLOAK_REALM and that KEYCLOAK_URL has no /auth prefix."
            : describeError(err)
    )
    return null
  }
}

function checkRoles(config: Config, token: string, report: Report) {
  const roles = realmManagementRoles(token)
  if (roles.length === 0) {
    report.fail(
      "Token carries no realm-management roles",
      "Assign roles on the client's Service accounts roles tab, or run `kc bootstrap`. Note: Full Scope Allowed being off does not strip service account roles, but an empty assignment does."
    )
    return
  }

  report.info(`realm-management roles: ${roles.join(", ")}`)

  const required = REQUIRED_ROLE[config.profile]!
  if (roles.includes("realm-admin")) {
    report.warn(
      "Token holds realm-admin",
      "That is the full composite of every realm-management role. Narrow it to view-users (cli) / manage-users (app)."
    )
  } else if (roles.includes(required)) {
    report.ok(`Has ${required}, as expected for the ${config.profile} profile`)
  } else if (
    config.profile === "cli" &&
    roles.includes("manage-users") &&
    !roles.includes("view-users")
  ) {
    report.warn(
      "The cli profile holds manage-users",
      "manage-users implies read, so this works — but the cli credential is meant to be read-only. Consider swapping it for view-users."
    )
  } else {
    report.fail(
      `Missing ${required}`,
      roles.includes("query-users")
        ? "query-users alone is the classic trap: searches return HTTP 200 with an EMPTY array rather than 403. Grant view-users."
        : `Assign realm-management → ${required} to this client's service account.`
    )
  }

  if (config.profile === "cli" && roles.includes("manage-users")) {
    report.warn(
      "Read-only expectation broken",
      "The cli credential can write to the realm. Anything using it should still refuse writes without --write."
    )
  }
}

async function checkUserRead(api: AdminApi, report: Report): Promise<boolean> {
  try {
    const users = await api.get<UserRepresentation[]>("/users?max=1")
    if (users.length === 0) {
      report.warn(
        "User search returned an empty list",
        "Either the realm has no users, or the token only has query-users (which returns 200 + empty rather than 403)."
      )
      return false
    }
    report.ok("User search works")
    return true
  } catch (err) {
    const status = err instanceof KeycloakError ? err.status : 0
    report.fail(
      "Cannot list users",
      status === 403
        ? "403 — the service account lacks view-users on the realm-management client."
        : describeError(err)
    )
    return false
  }
}

async function checkUserProfile(
  api: AdminApi,
  report: Report,
  attribute?: string
): Promise<UserProfileConfig | null> {
  let profile: UserProfileConfig
  try {
    profile = await api.get<UserProfileConfig>("/users/profile")
  } catch (err) {
    const status = err instanceof KeycloakError ? err.status : 0
    report.warn(
      "Could not read the realm user profile config",
      status === 403
        ? "403 — reading /users/profile needs a broader role than view-users. Not fatal, but the attribute gate below cannot be checked."
        : describeError(err)
    )
    return null
  }

  const policy = unmanagedPolicy(profile)
  const declared = profile.attributes?.map((a) => a.name) ?? []
  report.info(
    `Unmanaged attributes policy: ${policy}; ${declared.length} declared attribute(s)`
  )

  if (!attribute) {
    if (policy === "DISABLED") {
      report.warn(
        "Unmanaged attributes are DISABLED (Keycloak's default)",
        "Any custom attribute not declared in the user profile is invisible to the Admin API on read and silently dropped on write — HTTP 204, no error. Pass --attr <name> to check a specific one."
      )
    }
    return profile
  }

  const managed = findProfileAttribute(profile, attribute)
  if (managed) {
    const view = managed.permissions?.view ?? []
    const edit = managed.permissions?.edit ?? []
    const adminCanView = view.includes("admin") || edit.includes("admin")
    if (adminCanView) {
      report.ok(
        `"${attribute}" is a managed attribute readable by admin`,
        `view: [${view.join(", ")}], edit: [${edit.join(", ")}]`
      )
    } else {
      report.fail(
        `"${attribute}" is declared but not readable by admin`,
        `permissions.view is [${view.join(", ")}] — add "admin" or the Admin API will not return it.`
      )
    }
    return profile
  }

  // Not declared: the realm-wide unmanaged policy is what governs it.
  if (policy === "DISABLED") {
    report.fail(
      `"${attribute}" is unmanaged and the policy is DISABLED`,
      'Reads omit it and writes silently discard it. Fix by declaring it in Realm settings → User profile with permissions.view/edit = ["admin"], or run `kc bootstrap --attr ' +
        attribute +
        "`."
    )
  } else if (policy === "ADMIN_VIEW") {
    report.warn(
      `"${attribute}" is unmanaged; policy ADMIN_VIEW allows reads but not writes`,
      "Admin writes will be silently discarded."
    )
  } else {
    report.ok(`"${attribute}" is unmanaged but readable under policy ${policy}`)
  }
  return profile
}

async function checkSampleUser(
  api: AdminApi,
  report: Report,
  email: string,
  attribute: string | undefined,
  profile: UserProfileConfig | null
) {
  let users: UserRepresentation[]
  try {
    users = await api.get<UserRepresentation[]>(
      `/users?email=${encodeURIComponent(email)}&exact=true`
    )
  } catch (err) {
    report.fail("Lookup failed", describeError(err))
    return
  }

  if (users.length === 0) {
    report.fail(`No user with email ${email}`)
    return
  }
  const found = users[0]!

  // Re-fetch by id: the single-user endpoint is always the full
  // representation, whereas list results have been trimmed over the 26.x line.
  let user: UserRepresentation
  try {
    user = await api.get<UserRepresentation>(`/users/${found.id}`)
  } catch (err) {
    report.fail("Could not fetch the user by id", describeError(err))
    return
  }

  const keys = Object.keys(user.attributes ?? {})
  report.ok(
    `Found ${user.username ?? user.id}`,
    keys.length > 0
      ? `attributes visible to this token: ${keys.join(", ")}`
      : "no custom attributes visible to this token"
  )

  if (!attribute) return

  const value = user.attributes?.[attribute]?.[0]
  if (value !== undefined) {
    report.ok(`${attribute} = ${value}`)
    return
  }

  const policy = profile ? unmanagedPolicy(profile) : "unknown"
  report.fail(
    `${attribute} is absent from this user's representation`,
    policy === "DISABLED"
      ? "Expected — the attribute gate above is closed. Fix the user profile config first, then re-check; the value may well exist in the database."
      : "The gate is open, so this user genuinely has no such attribute set."
  )
}
