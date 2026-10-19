import "server-only"

// Credentials for lib/groups/google.ts. Vercel gives each production request
// an OIDC token; Google's STS swaps it for a short-lived token of the
// portal-groups service account (Workload Identity Federation). No
// long-lived key exists anywhere.
//
// Everything happens inside the request: @vercel/oidc reads the token from
// the request's x-vercel-oidc-token header, so calling it at module scope
// would find nothing. A client is built per call to groupsApiFromEnv(), and
// it caches the access token for the rest of that request.

import { getVercelOidcToken } from "@vercel/oidc"
import { ExternalAccountClient } from "google-auth-library"

import { credentialErrorMessage, readGroupsConfig } from "@/lib/groups/config"
import { GroupsCredentialError, type GroupsApi } from "@/lib/groups/google"

const SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.member",
]

export function groupsApiFromEnv(): GroupsApi | null {
  const config = readGroupsConfig(process.env)
  if (!config) return null

  let client: ReturnType<typeof ExternalAccountClient.fromJSON> = null
  try {
    client = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience: config.audience,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.saEmail}:generateAccessToken`,
      // No audience: the WIF provider accepts Vercel's default aud. Wrapped,
      // because google-auth-library passes a context argument that
      // getVercelOidcToken would otherwise read as its options.
      subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
      scopes: SCOPES,
    })
  } catch (err) {
    console.error("[groups] building the WIF client failed", err)
  }

  return {
    fetch,
    domain: config.domain,
    token: async () => {
      try {
        if (!client) throw new Error("WIF client could not be built")
        const { token } = await client.getAccessToken()
        if (!token) throw new Error("empty access token")
        return token
      } catch (err) {
        throw new GroupsCredentialError(
          credentialErrorMessage(
            process.env.VERCEL_ENV,
            err instanceof Error ? err.message : String(err)
          )
        )
      }
    },
  }
}
