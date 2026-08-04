// `kc users --attr <name>` — how an attribute is actually populated across the
// realm.
//
// Deliberately a distribution rather than a dump: the questions worth asking
// before building on an attribute are "what shape are the values", "how many
// people are missing one", and "how big is each cohort". None of those need
// a per-person listing, and a summary keeps personal data out of terminals
// and transcripts. `--list` is there when you genuinely need the rows.

import type { Config } from "./config"
import { redactor } from "./config"
import {
  AdminApi,
  serviceAccountToken,
  type UserRepresentation,
} from "./keycloak"
import { Report, describeError } from "./report"

export type UsersOptions = {
  attribute?: string
  list: boolean
  limit: number
}

// Keycloak's users endpoint has no cursor and no total header — page on
// first/max and stop when a page comes back short.
const PAGE = 100

async function fetchAllUsers(
  api: AdminApi,
  limit: number
): Promise<UserRepresentation[]> {
  const users: UserRepresentation[] = []
  for (let first = 0; users.length < limit; first += PAGE) {
    const page = await api.get<UserRepresentation[]>(
      `/users?first=${first}&max=${PAGE}`
    )
    users.push(...page)
    if (page.length < PAGE) break
  }
  return users.slice(0, limit)
}

export async function users(
  config: Config,
  options: UsersOptions
): Promise<number> {
  const report = new Report(redactor(config.secrets))

  if (!config.url || !config.realm || !config.credentials) {
    report.fail("Not configured — run `kc doctor` for the details")
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

  let all: UserRepresentation[]
  try {
    all = await fetchAllUsers(api, options.limit)
  } catch (err) {
    report.fail("Could not list users", describeError(err))
    return report.summary()
  }

  report.heading(`Realm "${config.realm}" — ${all.length} user(s) read`)

  const attribute = options.attribute
  if (!attribute) {
    // Without a target attribute, the useful summary is which attributes are
    // populated at all — a quick map of what this realm actually carries.
    const counts = new Map<string, number>()
    for (const user of all) {
      for (const key of Object.keys(user.attributes ?? {})) {
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    report.heading("Attributes present, by number of users")
    for (const [key, count] of [...counts].sort((a, b) => b[1] - a[1])) {
      report.info(`${key} — ${count}`)
    }
    return report.summary()
  }

  const withValue: { user: UserRepresentation; value: string }[] = []
  const missing: UserRepresentation[] = []
  for (const user of all) {
    const value = user.attributes?.[attribute]?.[0]
    if (value === undefined || value === "") missing.push(user)
    else withValue.push({ user, value })
  }

  report.heading(`"${attribute}" coverage`)
  report.info(`${withValue.length} with a value, ${missing.length} without`)

  const byValue = new Map<string, number>()
  for (const { value } of withValue) {
    byValue.set(value, (byValue.get(value) ?? 0) + 1)
  }

  if (byValue.size > 0) {
    report.heading("Distribution")
    const sorted = [...byValue].sort((a, b) => a[0].localeCompare(b[0]))
    for (const [value, count] of sorted) {
      report.info(`${value} — ${count} user(s)`)
    }
  }

  if (options.list) {
    report.heading("Users")
    for (const { user, value } of withValue) {
      report.info(`${value}  ${user.username ?? user.id}`)
    }
    if (missing.length > 0) {
      report.heading(`Missing "${attribute}"`)
      for (const user of missing) {
        report.info(user.username ?? user.id)
      }
    }
  }

  return report.summary()
}
