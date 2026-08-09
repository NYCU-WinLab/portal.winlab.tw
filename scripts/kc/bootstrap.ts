// `kc bootstrap` — provision the two service-account clients over the Admin
// REST API, so nobody has to click through the Keycloak admin console.
//
// The one thing this cannot invent is its own authority: creating a client
// requires a credential that can already create clients. Supply a Keycloak
// admin login once via KEYCLOAK_BOOTSTRAP_USERNAME / _PASSWORD (password
// grant through the built-in `admin-cli` client), let this run, then delete
// those two lines — which this command does for you. Everything the *portal*
// needs afterwards runs on the service accounts; the attribute work here
// (`--attr`, `--allow-user-edit`) needs `manage-realm` and so needs that admin
// login restored for the run.
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
  realmManagementRoles,
  serviceAccountToken,
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
// read-only by construction: a leaked laptop secret cannot mutate the realm.
// It is also what the deployed portal authenticates as: the same secret,
// deployed under KEYCLOAK_READ_CLIENT_* rather than the KEYCLOAK_CLI_CLIENT_*
// name this tool writes locally. So revoking it does take the portal's
// Keycloak reads down with it — §6.1 of the research record says otherwise and
// is wrong on that point. Giving prod its own view-users client would separate
// the two; that is a deliberate deferral, not an oversight.
const CLIENTS: ClientSpec[] = [
  {
    clientId: "winlab-portal-admin",
    name: "WinLab admin tooling (write)",
    description:
      "Service account for administrative tooling — `kc import-attributes` and other deliberate writes. NOT used by the deployed portal, which holds a read-only credential (see issue #416).",
    role: "manage-users",
    envPrefix: "KEYCLOAK_ADMIN_CLIENT",
  },
  {
    clientId: "winlab-kc-cli",
    name: "WinLab Keycloak read-only",
    description:
      "Read-only service account for local tooling, coding agents, and the deployed portal. view-users only.",
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
  /**
   * Add "user" to --attr's edit permission, so users can change their own
   * value — in the Account Console and in every other user-facing profile
   * context (registration, update-profile required actions). This is a
   * realm-wide permission change, not a per-user grant.
   *
   * Opt-in on purpose: widening a permission someone else set is not something
   * to do as a side effect of provisioning clients. Requires --attr; the CLI
   * refuses the flag without one.
   */
  allowUserEdit: boolean
  attribute?: string
  configPath: string
}

export async function bootstrap(
  config: Config,
  options: BootstrapOptions
): Promise<number> {
  // Grows as client secrets are read back from Keycloak. The redactor closes
  // over this array, so secrets minted mid-run are scrubbed from every line
  // printed after them — including a Keycloak error body echoing one back.
  const secretsSeen = [...config.secrets]
  const report = new Report(redactor(secretsSeen))

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
    const secret = await provisionClient(
      api,
      spec,
      rmId,
      options.apply,
      report,
      (value) => secretsSeen.push(value)
    )
    if (!secret) continue
    secrets[spec.envPrefix] = secret
    await verifyClient(config, spec, secret, report)
  }

  if (options.attribute) {
    report.heading(`User profile attribute: ${options.attribute}`)
    await provisionAttribute(
      api,
      options.attribute,
      { apply: options.apply, allowUserEdit: options.allowUserEdit },
      report
    )
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

// Keycloak accepting a role mapping does not mean an issued token will carry
// it — the first run of this tool reported three green lines and produced two
// credentials that 403'd on everything. Nothing here is trustworthy until a
// real token has been read back, so prove it rather than infer it.
async function verifyClient(
  config: Config,
  spec: ClientSpec,
  secret: string,
  report: Report
) {
  try {
    const { accessToken } = await serviceAccountToken(
      config.url,
      config.realm,
      spec.clientId,
      secret
    )
    const roles = realmManagementRoles(accessToken)
    if (roles.includes(spec.role)) {
      report.ok(`Verified — its own token carries ${spec.role}`)
      return
    }
    report.fail(
      `Its own token does NOT carry ${spec.role}`,
      roles.length === 0
        ? "No realm-management roles at all. With Full Scope Allowed off, the role has to be in the client's scope mapping as well as on the service account."
        : `Token carries: ${roles.join(", ")}`
    )
  } catch (err) {
    report.fail("Could not authenticate as the new client", describeError(err))
  }
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
  report: Report,
  onSecret: (secret: string) => void
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
    report.info(
      `would grant realm-management → ${spec.role} (service account role + client scope mapping)`
    )
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
    const mapping = [{ id: role.id, name: role.name }]

    // Idempotent: Keycloak ignores a mapping that is already present.
    await api.post(
      `/users/${serviceAccount.id}/role-mappings/clients/${realmManagementUuid}`,
      mapping
    )

    // Both halves are required. The roles in an issued token are the
    // INTERSECTION of the service account's roles and the client's scope, so
    // with fullScopeAllowed off the grant above alone yields a token carrying
    // no realm-management roles at all — every admin call then 403s while the
    // console shows the role correctly assigned.
    await api.post(
      `/clients/${uuid}/scope-mappings/clients/${realmManagementUuid}`,
      mapping
    )

    report.ok(
      `Granted realm-management → ${spec.role}`,
      "role assigned to the service account and added to the client scope"
    )
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
    onSecret(credential.value)
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
  options: { apply: boolean; allowUserEdit: boolean },
  report: Report
) {
  const { apply, allowUserEdit } = options

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

    // This gate runs before --allow-user-edit, not after it. An attribute no
    // admin can see or edit belongs to someone else's configuration, and the
    // flag means "let its owner edit it too" — not "take it over". Widening
    // one anyway would also strand it: nothing in this tool could read it
    // back afterwards to confirm what it did.
    if (!view.includes("admin") && !edit.includes("admin")) {
      report.warn(
        "Declared but not admin-readable",
        `permissions.view is [${view.join(", ")}]. Not changing an attribute someone else configured — add "admin" by hand if that is intended.`
      )
      return
    }

    if (allowUserEdit) {
      await widenEditToUser(api, profile, name, apply, report)
      return
    }

    report.ok(`Already declared and admin-readable (policy left untouched)`)
    if (!edit.includes("user")) {
      report.info(
        `edit is [${edit.join(", ")}] — its owner cannot change it in the Account Console. Pass --allow-user-edit if they should be able to.`
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

  // --allow-user-edit has to apply here too. Declaring the attribute and then
  // widening it are the same request to Keycloak, so a flag that no-opped on
  // this path would declare the attribute admin-only while the operator
  // believed they had made it user-editable.
  //
  // "user" goes in both lists: edit without view is a field its owner can
  // write but cannot read.
  const permissions = allowUserEdit
    ? { view: ["admin", "user"], edit: ["admin", "user"] }
    : { view: ["admin"], edit: ["admin"] }
  const shape = `view = [${permissions.view.join(", ")}], edit = [${permissions.edit.join(", ")}]`

  if (!apply) {
    report.info(`would declare "${name}" as a managed attribute with ${shape}`)
    return
  }

  const next: UserProfileConfig = {
    ...profile,
    attributes: [
      ...(profile.attributes ?? []),
      {
        name,
        displayName: name,
        permissions,
        annotations: { inputType: "text" },
      },
    ],
  }

  try {
    await api.put("/users/profile", next)
  } catch (err) {
    reportProfileWriteFailure(err, report)
    return
  }

  await verifyProfileWrite(
    api,
    next,
    name,
    permissions.edit,
    report,
    (kept) =>
      `Declared "${name}" as a managed attribute (${shape}) — verified by reading back, ${kept} attribute(s) intact`
  )
}

// Add "user" to one attribute's edit permission, leaving every other attribute
// and every other field of that attribute exactly as found.
//
// PUT /users/profile replaces the whole profile config — it is not a patch. A
// write that rebuilds the document from a partial idea of it silently drops
// every attribute it forgot: every declared attribute in the realm bar one. So
// the only safe shape is: take the document Keycloak just gave us, change one
// array inside it, send it back.
async function widenEditToUser(
  api: AdminApi,
  profile: UserProfileConfig,
  name: string,
  apply: boolean,
  report: Report
) {
  // Derived here rather than passed in: two parameters that must agree is one
  // more way for a caller to be wrong.
  const edit = findProfileAttribute(profile, name)?.permissions?.edit ?? []

  if (edit.includes("user")) {
    report.ok(`edit already includes "user" — nothing to do`)
    return
  }

  // Appending is the only mutation here, so an attribute admin cannot already
  // edit would come back as edit = ["user"] — admin's write access removed as
  // a side effect, reported as success. Refuse rather than quietly grant an
  // admin permission nobody asked for.
  if (!edit.includes("admin")) {
    report.fail(
      `"${name}" permissions.edit is [${edit.join(", ") || "empty"}] — refusing to widen`,
      'Appending "user" would leave admin unable to edit it. Add "admin" to the attribute in the console first, then re-run.'
    )
    return
  }

  const nextEdit = [...edit, "user"]
  if (!apply) {
    report.info(
      `would change "${name}" permissions.edit from [${edit.join(", ")}] to [${nextEdit.join(", ")}]`
    )
    report.info(
      `${(profile.attributes ?? []).length} declared attribute(s) would be re-sent unchanged (the PUT is a full replace)`
    )
    return
  }

  const next: UserProfileConfig = {
    ...profile,
    attributes: (profile.attributes ?? []).map((attr) =>
      attr.name === name
        ? { ...attr, permissions: { ...attr.permissions, edit: nextEdit } }
        : attr
    ),
  }

  try {
    await api.put("/users/profile", next)
  } catch (err) {
    reportProfileWriteFailure(err, report)
    return
  }

  await verifyProfileWrite(
    api,
    next,
    name,
    nextEdit,
    report,
    (kept) =>
      `"${name}" edit is now [${nextEdit.join(", ")}] — verified by reading back, ${kept} attribute(s) intact`
  )
}

// A rejected write and a lost response leave the realm in different states,
// and only one of them can honestly be called "nothing changed". A 4xx is
// Keycloak refusing; a timeout or a dropped connection may have arrived and
// been applied before the response went missing.
function reportProfileWriteFailure(err: unknown, report: Report) {
  const status = err instanceof KeycloakError ? err.status : 0
  if (status >= 400 && status < 500) {
    report.fail(
      "Keycloak rejected the user profile update — nothing was changed",
      describeError(err)
    )
    return
  }
  report.fail(
    "The user profile update did not complete cleanly — it MAY have been applied",
    `${describeError(err)}. Re-run to find out: this command is idempotent and reports the current state.`
  )
}

// Read the config back and check what landed. Not because this endpoint is
// known to ignore writes — that is untested here, and the one change we have
// watched did stick — but because it is a full-document replace, so a PUT that
// lost a declaration would stay invisible until someone noticed a field had
// stopped working. Verify names rather than counts: a drop-one/add-one keeps
// the count identical.
async function verifyProfileWrite(
  api: AdminApi,
  sent: UserProfileConfig,
  name: string,
  expectedEdit: string[],
  report: Report,
  okMessage: (kept: number) => string
) {
  let after: UserProfileConfig | null
  try {
    after = await api.get<UserProfileConfig | null>("/users/profile")
  } catch (err) {
    report.fail("Could not verify the change", describeError(err))
    return
  }
  if (!after) {
    report.fail(
      "Read-back returned an empty body — cannot confirm the change landed",
      "Check the attribute in the admin console before re-running."
    )
    return
  }

  const stored = after
  const got = findProfileAttribute(stored, name)?.permissions?.edit ?? []
  const missing = expectedEdit.filter((role) => !got.includes(role))
  if (missing.length > 0) {
    report.fail(
      `Keycloak accepted the write but "${name}" edit is [${got.join(", ")}] — missing ${missing.join(", ")}`,
      "The realm may be rejecting the change for this attribute; check it in the admin console."
    )
    return
  }

  const sentNames = (sent.attributes ?? []).map((a) => a.name).sort()
  const gotNames = (stored.attributes ?? []).map((a) => a.name).sort()
  const lost = sentNames.filter((n) => !gotNames.includes(n))
  const gained = gotNames.filter((n) => !sentNames.includes(n))
  if (lost.length > 0 || gained.length > 0) {
    report.fail(
      `Declared attributes changed: sent ${sentNames.length}, stored ${gotNames.length}`,
      [
        lost.length ? `lost: ${lost.join(", ")}` : "",
        gained.length ? `gained: ${gained.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("  ")
    )
    return
  }

  // Reverting this to DISABLED would make every undeclared attribute in the
  // realm invisible to the Admin API — a realm-wide outage from a one-field
  // change, and nothing else in this run would mention it.
  if (stored.unmanagedAttributePolicy !== sent.unmanagedAttributePolicy) {
    report.fail(
      `unmanagedAttributePolicy changed: ${sent.unmanagedAttributePolicy ?? "(unset)"} → ${stored.unmanagedAttributePolicy ?? "(unset)"}`,
      "Every undeclared attribute in the realm just changed visibility to the Admin API."
    )
    return
  }

  // Field-level drift is a warning, not a failure: Keycloak normalises some
  // config on write, so a difference here is worth reading before trusting the
  // realm — but it is not by itself proof that anything was lost.
  const drifted = (sent.attributes ?? [])
    .filter((a) => a.name !== name)
    .filter(
      (a) =>
        JSON.stringify(a) !==
        JSON.stringify(findProfileAttribute(stored, a.name))
    )
    .map((a) => a.name)
  if (drifted.length > 0) {
    report.warn(
      `Stored differently than sent: ${drifted.join(", ")}`,
      "Keycloak normalises some fields on write. Compare against the console if any of these carry validations you rely on."
    )
  }

  report.ok(okMessage(gotNames.length))
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
    "#   KEYCLOAK_ADMIN_* — manage-users. Admin tooling only; the deployed portal",
    "#                      never holds a credential that can write.",
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
      "Remaining manual step: the deployed portal needs KEYCLOAK_URL, KEYCLOAK_REALM, and the READ-ONLY client's id/secret as KEYCLOAK_READ_CLIENT_ID / KEYCLOAK_READ_CLIENT_SECRET in its hosting environment. Never give it the manage-users pair — see issue #416. Hosting env is outside Keycloak and cannot be provisioned from here."
    )
  } catch (err) {
    report.fail(`Could not write ${path}`, describeError(err))
  }
}
