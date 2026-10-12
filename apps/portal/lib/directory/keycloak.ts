import {
  adminRealmUrl,
  KeycloakAdminError,
  type KeycloakEnv,
} from "@/lib/keycloak/admin"

import type { DirectoryUser } from "./members"

// Explicit pagination avoids silently truncating larger rosters. Request full
// representations because the directory needs custom profile attributes.
export async function fetchDirectoryUsers(
  env: KeycloakEnv,
  token: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch
): Promise<DirectoryUser[]> {
  const users: DirectoryUser[] = []
  const pageSize = 100
  for (let first = 0; ; first += pageSize) {
    const response = await fetcher(
      `${adminRealmUrl(env)}/users?first=${first}&max=${pageSize}&briefRepresentation=false`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!response.ok) throw new KeycloakAdminError("get", response.status)
    const page: DirectoryUser[] = await response.json()
    users.push(...page)
    if (page.length < pageSize) return users
  }
}
