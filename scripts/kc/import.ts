// `kc import-attributes` — backfill user attributes from a reconciled plan.
//
// Input is a TSV of `attribute<TAB>username<TAB>value`, produced by whatever
// reconciled the two systems. Keeping the reconciliation outside this command
// is deliberate: deciding which source wins is a judgement call that deserves
// review, while applying an agreed list should be mechanical and boring.
//
// Three safety properties, in order of how badly their absence would hurt:
//
//   1. Writes are GET-merge-PUT. Keycloak's PUT replaces the whole attribute
//      map, so sending one attribute would delete every other one the user
//      has. See the research record §1.2.
//   2. Only empty fields are filled, re-checked against a fresh read at write
//      time rather than trusting the plan. A plan is a snapshot; someone may
//      have typed a value in the minutes since it was made.
//   3. Dry run by default. `--apply` is the deliberate step.

import { readFile } from "node:fs/promises"

import type { Config } from "./config"
import { redactor } from "./config"
import {
  AdminApi,
  attributePattern,
  findProfileAttribute,
  serviceAccountToken,
  type UserProfileConfig,
  type UserRepresentation,
} from "./keycloak"
import { Report, describeError } from "./report"

export type ImportOptions = {
  apply: boolean
  planPath: string
}

type PlannedChange = {
  attribute: string
  username: string
  value: string
}

type Outcome =
  | "written"
  | "already-set"
  | "unchanged"
  | "missing"
  | "invalid"
  | "failed"

/**
 * Keycloak validates managed attributes on write and rejects the entire PUT
 * with a 400 — taking any other attribute in the same request down with it.
 * Checking the realm's own pattern up front turns that from a half-finished
 * batch into a dry-run finding.
 */
function buildValidators(
  profile: UserProfileConfig
): Map<string, { test: (value: string) => boolean; describe: string }> {
  const validators = new Map<
    string,
    { test: (value: string) => boolean; describe: string }
  >()
  for (const attribute of profile.attributes ?? []) {
    const pattern = attributePattern(attribute)
    if (!pattern) continue
    let regex: RegExp
    try {
      regex = new RegExp(pattern.source)
    } catch {
      // An unparseable pattern is Keycloak's problem, not ours; let the write
      // attempt surface it rather than blocking on a regex dialect mismatch.
      continue
    }
    validators.set(attribute.name, {
      test: (value: string) => regex.test(value),
      describe: pattern.message
        ? `${pattern.message} (${pattern.source})`
        : pattern.source,
    })
  }
  return validators
}

async function readPlan(path: string): Promise<PlannedChange[]> {
  const text = await readFile(path, "utf8")
  const plan: PlannedChange[] = []
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith("#")) continue
    const [attribute, username, value] = line.split("\t")
    if (!attribute || !username || !value) continue
    plan.push({ attribute, username, value })
  }
  return plan
}

export async function importAttributes(
  config: Config,
  options: ImportOptions
): Promise<number> {
  const report = new Report(redactor(config.secrets))

  if (!config.url || !config.realm || !config.credentials) {
    report.fail("Not configured — run `kc doctor` for the details")
    return report.summary()
  }

  let plan: PlannedChange[]
  try {
    plan = await readPlan(options.planPath)
  } catch (err) {
    report.fail(`Could not read ${options.planPath}`, describeError(err))
    return report.summary()
  }
  if (plan.length === 0) {
    report.fail(`${options.planPath} contains no usable rows`)
    return report.summary()
  }

  let api: AdminApi
  try {
    const { accessToken } = await serviceAccountToken(
      config.url,
      config.realm,
      config.credentials.clientId,
      config.credentials.clientSecret
    )
    api = new AdminApi(config.url, config.realm, accessToken)
  } catch (err) {
    report.fail("Could not authenticate", describeError(err))
    return report.summary()
  }

  report.heading(
    options.apply
      ? `Applying ${plan.length} change(s) to realm "${config.realm}"`
      : `Dry run — ${plan.length} planned change(s) for realm "${config.realm}" (pass --apply to write)`
  )

  if (options.apply && config.profile !== "app") {
    report.fail(
      "Writing needs the `app` profile",
      "The default `cli` credential holds view-users only. Re-run with --profile app."
    )
    return report.summary()
  }

  // One read per user rather than per change: a user usually has more than one
  // attribute in the plan, and Keycloak's admin API has no batch read.
  const byUsername = new Map<string, PlannedChange[]>()
  for (const change of plan) {
    const list = byUsername.get(change.username) ?? []
    list.push(change)
    byUsername.set(change.username, list)
  }

  let validators = new Map<
    string,
    { test: (value: string) => boolean; describe: string }
  >()
  try {
    const profile = await api.get<UserProfileConfig>("/users/profile")
    validators = buildValidators(profile)
    for (const change of plan) {
      if (!findProfileAttribute(profile, change.attribute)) {
        report.warn(
          `"${change.attribute}" is not declared in the realm user profile`,
          "Writes to it will be silently discarded under the default unmanaged-attribute policy."
        )
        break
      }
    }
  } catch (err) {
    report.warn(
      "Could not read the realm user profile — values will not be pre-validated",
      describeError(err)
    )
  }

  const tally: Record<Outcome, number> = {
    written: 0,
    "already-set": 0,
    unchanged: 0,
    missing: 0,
    invalid: 0,
    failed: 0,
  }
  const notes: string[] = []

  for (const [username, changes] of byUsername) {
    let user: UserRepresentation | undefined
    try {
      const found = await api.get<UserRepresentation[]>(
        `/users?username=${encodeURIComponent(username)}&exact=true`
      )
      user = found[0]
    } catch (err) {
      tally.failed += changes.length
      notes.push(`${username}: lookup failed — ${describeError(err)}`)
      continue
    }

    if (!user) {
      tally.missing += changes.length
      notes.push(`${username}: no such user`)
      continue
    }

    const attributes: Record<string, string[]> = { ...(user.attributes ?? {}) }
    const applied: string[] = []

    for (const change of changes) {
      const validator = validators.get(change.attribute)
      if (validator && !validator.test(change.value)) {
        // Skipping rather than sending keeps one bad value from failing the
        // whole user's PUT, and every other attribute along with it.
        tally.invalid += 1
        notes.push(
          `${username}: ${change.attribute}="${change.value}" fails the realm's rule — ${validator.describe}`
        )
        continue
      }

      const current = attributes[change.attribute]?.[0]?.trim()
      if (current === change.value) {
        tally.unchanged += 1
        continue
      }
      if (current) {
        // Never overwrite. A disagreement is a decision for a person, and the
        // reconciliation step is where it belongs.
        tally["already-set"] += 1
        notes.push(
          `${username}: ${change.attribute} already set to "${current}", plan says "${change.value}" — left alone`
        )
        continue
      }
      attributes[change.attribute] = [change.value]
      applied.push(`${change.attribute}=${change.value}`)
    }

    if (applied.length === 0) continue

    if (!options.apply) {
      tally.written += applied.length
      report.info(`${username}  ${applied.join("  ")}`)
      continue
    }

    try {
      // Whole representation back, with only `attributes` swapped — anything
      // else omitted here would be cleared.
      await api.put(`/users/${user.id}`, { ...user, attributes })
    } catch (err) {
      tally.failed += applied.length
      notes.push(`${username}: write failed — ${describeError(err)}`)
      continue
    }

    // Read back rather than trusting the 204: under a DISABLED unmanaged
    // policy Keycloak accepts the write and stores nothing.
    try {
      const after = await api.get<UserRepresentation>(`/users/${user.id}`)
      const stuck = changes.filter(
        (c) => after.attributes?.[c.attribute]?.[0]?.trim() === c.value
      )
      tally.written += stuck.length
      if (stuck.length < applied.length) {
        tally.failed += applied.length - stuck.length
        notes.push(
          `${username}: wrote ${applied.length} but only ${stuck.length} came back — is the attribute declared in the realm user profile?`
        )
      }
    } catch (err) {
      notes.push(`${username}: could not verify — ${describeError(err)}`)
    }
  }

  report.heading("Result")
  report.line(
    tally.written > 0 ? "ok" : "info",
    options.apply
      ? `${tally.written} attribute(s) written and verified`
      : `${tally.written} attribute(s) would be written`
  )
  if (tally.unchanged > 0) {
    report.info(`${tally.unchanged} already hold the planned value`)
  }
  if (tally["already-set"] > 0) {
    report.warn(
      `${tally["already-set"]} hold a DIFFERENT value and were left alone`
    )
  }
  if (tally.missing > 0) report.warn(`${tally.missing} target no known user`)
  if (tally.invalid > 0) {
    report.fail(
      `${tally.invalid} would be rejected by the realm's validation — not sent`
    )
  }
  if (tally.failed > 0) report.fail(`${tally.failed} failed`)

  if (notes.length > 0) {
    report.heading("Notes")
    for (const note of notes.slice(0, 40)) report.info(note)
    if (notes.length > 40) {
      report.info(`… and ${notes.length - 40} more`)
    }
  }

  if (!options.apply) {
    report.heading("Nothing was changed")
    report.info("Re-run with --profile app --apply to write.")
  }

  return report.summary()
}
