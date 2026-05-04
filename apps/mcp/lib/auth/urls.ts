const DEFAULT_BASE_URL = "https://mcp.winlab.tw"

export function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    ""
  )
}

export function getMcpResourceUrl(baseUrl = getBaseUrl()) {
  return `${baseUrl}/mcp`
}

export function getProtectedResourceMetadataUrl(baseUrl = getBaseUrl()) {
  return `${baseUrl}/.well-known/oauth-protected-resource/mcp`
}
