#!/usr/bin/env bun
// `kc` — Keycloak realm tooling for portal.winlab.tw.
//
//   bun run kc doctor [--attr <name>] [--user <email>] [--profile cli|app]
//   bun run kc bootstrap [--apply] [--attr <name>]
//
// Read-only by default and read-only by credential: the `cli` profile is a
// service account holding view-users and nothing else. Anything that writes
// has to say so explicitly.
//
// Background, and the silent failure modes this exists to surface:
// docs/keycloak/2026-07-28-keycloak-26.7-admin-api-research.md

import { bootstrap } from "./bootstrap"
import { defaultConfigPath, loadConfig, type ProfileName } from "./config"
import { doctor } from "./doctor"
import { describeError } from "./report"

const USAGE = `
kc — Keycloak realm tooling for portal.winlab.tw

  bun run kc doctor [options]      Diagnose the realm connection end to end
  bun run kc bootstrap [options]   Provision the service-account clients

Options
  --profile <cli|app>   Which credential to use (default: cli, read-only)
  --attr <name>         Attribute to check, or to declare during bootstrap
  --user <email>        Read one user as a live end-to-end check (doctor)
  --apply               Execute the plan instead of describing it (bootstrap)
  --config <path>       Credential file (default: ${defaultConfigPath()})

Credentials are read from, in increasing precedence:
  ./apps/portal/.env.local, ${defaultConfigPath()},
  $WINLAB_KC_ENV, then the process environment.
`.trim()

type Args = {
  command: string
  profile: ProfileName
  attribute?: string
  user?: string
  apply: boolean
  configPath: string
}

function parseArgs(argv: string[]): Args | null {
  const [command, ...rest] = argv
  if (!command || command === "--help" || command === "-h") return null

  const args: Args = {
    command,
    profile: "cli",
    apply: false,
    configPath: defaultConfigPath(),
  }

  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i]
    const next = rest[i + 1]
    switch (flag) {
      case "--apply":
        args.apply = true
        break
      case "--profile":
        if (next !== "cli" && next !== "app") {
          throw new Error("--profile must be `cli` or `app`")
        }
        args.profile = next
        i += 1
        break
      case "--attr":
        if (!next) throw new Error("--attr needs an attribute name")
        args.attribute = next
        i += 1
        break
      case "--user":
        if (!next) throw new Error("--user needs an email address")
        args.user = next
        i += 1
        break
      case "--config":
        if (!next) throw new Error("--config needs a path")
        args.configPath = next
        i += 1
        break
      default:
        throw new Error(`unknown option: ${flag}`)
    }
  }

  return args
}

async function main(): Promise<number> {
  let args: Args | null
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`${describeError(err)}\n\n${USAGE}`)
    return 2
  }
  if (!args) {
    console.log(USAGE)
    return 0
  }

  // The config file is also a credential source, so honour --config for both.
  if (args.configPath !== defaultConfigPath()) {
    process.env.WINLAB_KC_ENV = args.configPath
  }

  const config = await loadConfig(args.profile)

  switch (args.command) {
    case "doctor":
      return doctor(config, { attribute: args.attribute, user: args.user })
    case "bootstrap":
      return bootstrap(config, {
        apply: args.apply,
        attribute: args.attribute,
        configPath: args.configPath,
      })
    default:
      console.error(`unknown command: ${args.command}\n\n${USAGE}`)
      return 2
  }
}

process.exit(await main())
