// The three Vercel env vars behind /groups, set by the maintainer on the
// Production environment only. Any one missing reads as "not configured" —
// which is what preview and local dev see.

export type GroupsConfig = {
  /** WIF provider, //iam.googleapis.com/projects/<n>/locations/global/workloadIdentityPools/<pool>/providers/<provider> */
  audience: string
  /** The service account WIF impersonates. */
  saEmail: string
  /** Workspace domain; the only one whose groups /groups may touch. */
  domain: string
}

export function readGroupsConfig(
  env: Record<string, string | undefined>
): GroupsConfig | null {
  const audience = env.GOOGLE_GROUPS_WIF_AUDIENCE?.trim()
  const saEmail = env.GOOGLE_GROUPS_SA_EMAIL?.trim()
  const domain = env.GOOGLE_GROUPS_DOMAIN?.trim().toLowerCase()
  if (!audience || !saEmail || !domain) return null
  return { audience, saEmail, domain }
}

/**
 * The service account trusts only production deployments' OIDC tokens, so a
 * preview or local run that has the env vars set still cannot get a token.
 * Say that, instead of surfacing a bare STS error.
 */
export function credentialErrorMessage(
  vercelEnv: string | undefined,
  cause: string
): string {
  const where = vercelEnv || "本機"
  return `無法取得 Google 權杖（目前環境：${where}）。只有 production 部署能透過 Workload Identity Federation 換到權杖，preview 與本機一定會被拒絕。原始錯誤：${cause}`
}
