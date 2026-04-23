import { getMcpResourceUrl } from "@/lib/auth/urls"

export function getProtectedResourceMetadata(baseUrl: string) {
  return {
    resource: getMcpResourceUrl(baseUrl),
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
  }
}
