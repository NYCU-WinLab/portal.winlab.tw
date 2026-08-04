// `kc profile` — list the realm's declared user-profile attributes.
//
// This is the answer to "what is the attribute actually called, and can the
// Admin API see it". Keycloak's default hides anything undeclared, so the
// declared list is the set of attributes that are usable at all — and each
// one's permissions decide whether an admin token may read or write it.

import type { Config } from "./config"
import { redactor } from "./config"
import {
  AdminApi,
  KeycloakError,
  serviceAccountToken,
  unmanagedPolicy,
  type UserProfileConfig,
} from "./keycloak"
import { Report, describeError } from "./report"

export async function profile(config: Config): Promise<number> {
  const report = new Report(redactor(config.secrets))

  if (!config.url || !config.realm || !config.credentials) {
    report.fail("Not configured — run `kc doctor` for the details")
    return report.summary()
  }

  let token: string
  try {
    const result = await serviceAccountToken(
      config.url,
      config.realm,
      config.credentials.clientId,
      config.credentials.clientSecret
    )
    token = result.accessToken
  } catch (err) {
    report.fail("Could not authenticate", describeError(err))
    return report.summary()
  }

  const api = new AdminApi(config.url, config.realm, token)
  let userProfile: UserProfileConfig
  try {
    userProfile = await api.get<UserProfileConfig>("/users/profile")
  } catch (err) {
    const status = err instanceof KeycloakError ? err.status : 0
    report.fail(
      "Could not read the user profile config",
      status === 403
        ? "403 — this credential cannot read /users/profile."
        : describeError(err)
    )
    return report.summary()
  }

  const policy = unmanagedPolicy(userProfile)
  report.heading(
    `Realm "${config.realm}" — unmanaged attribute policy: ${policy}`
  )
  if (policy === "DISABLED") {
    report.info(
      "Undeclared attributes are invisible to the Admin API. Only the attributes below exist as far as this tool is concerned."
    )
  }

  const attributes = userProfile.attributes ?? []
  if (attributes.length === 0) {
    report.warn("No attributes declared")
    return report.summary()
  }

  report.heading(`Declared attributes (${attributes.length})`)
  const width = Math.max(...attributes.map((a) => a.name.length))
  for (const attribute of attributes) {
    const view = attribute.permissions?.view ?? []
    // Keycloak grants view implicitly wherever edit is granted.
    const edit = attribute.permissions?.edit ?? []
    const adminReads = view.includes("admin") || edit.includes("admin")
    const adminWrites = edit.includes("admin")
    const access = adminWrites
      ? "admin: read+write"
      : adminReads
        ? "admin: read only"
        : "admin: NO ACCESS"
    report.line(
      adminReads ? "ok" : "warn",
      `${attribute.name.padEnd(width)}  ${access}`,
      attribute.displayName && attribute.displayName !== attribute.name
        ? attribute.displayName
        : undefined
    )
  }

  return report.summary()
}
