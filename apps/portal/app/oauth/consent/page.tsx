import { PortalShell } from "@/components/portal-shell"

import { ConsentCard } from "./_components/consent-card"

type ConsentPageProps = {
  searchParams: Promise<{ authorization_id?: string }>
}

// Supabase Auth's OAuth 2.1 server sends people here (the configured
// authorization path) to approve a third-party client such as an MCP client.
// The proxy has already made sure they are signed in, carrying the
// authorization_id through /auth/login?next=... on the way.
export default async function ConsentPage({ searchParams }: ConsentPageProps) {
  const { authorization_id } = await searchParams

  return (
    <PortalShell appName="Authorize">
      <div className="flex min-h-[60vh] flex-col justify-center">
        <ConsentCard authorizationId={authorization_id ?? null} />
      </div>
    </PortalShell>
  )
}
