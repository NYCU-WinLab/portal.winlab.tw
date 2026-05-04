import {
  parseAuthorizeRequest,
  validateOAuthClientRequest,
} from "@/lib/auth/oauth-request"
import { getMcpResourceUrl } from "@/lib/auth/urls"

import { AuthorizeForm } from "./authorize-form"

type AuthorizePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AuthorizePage({
  searchParams,
}: AuthorizePageProps) {
  const result = await loadAuthorize(searchParams)

  if ("error" in result) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-20">
        <h1 className="mb-2 text-2xl">Authorization failed</h1>
        <p className="text-sm text-destructive" role="alert">
          {result.error}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Return to the MCP client and retry the authorization flow.
        </p>
      </main>
    )
  }

  return (
    <AuthorizeForm
      clientId={result.clientId}
      redirectUri={result.redirectUri}
      codeChallenge={result.codeChallenge}
      resource={result.resource}
      state={result.state}
    />
  )
}

async function loadAuthorize(searchParams: AuthorizePageProps["searchParams"]) {
  try {
    const resolved = await searchParams
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === "string") params.set(key, value)
    }

    const request = parseAuthorizeRequest(params)
    await validateOAuthClientRequest(request, {
      expectedResource: getMcpResourceUrl(),
    })
    return request
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Request validation failed",
    }
  }
}
