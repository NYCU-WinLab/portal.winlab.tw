import Link from "next/link"

import { PortalShell } from "@/components/portal-shell"
import { SignOutButton } from "@/components/sign-out-button"
import { UserCard } from "@/components/user-card"
import { getProfile, normalizeUser } from "@/lib/user"

import {
  FieldRow,
  JsonBlock,
  Section,
  formatUnixSeconds,
  maskToken,
} from "./_components/profile-ui"

export default async function ProfilePage() {
  const profile = (await getProfile())!
  const { user, session } = profile
  const display = normalizeUser(user)
  const identities = user.identities ?? []
  const factors = user.factors ?? []

  return (
    <PortalShell
      appName="Profile"
      appHref="/profile"
      bottomLeft={
        <Link href="/" className="transition-colors hover:text-foreground">
          Portal
        </Link>
      }
    >
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">Profile</h1>
          <p className="text-sm text-muted-foreground">
            Everything Supabase knows about you right now.
          </p>
        </div>

        <UserCard
          name={display.name}
          email={display.email}
          avatarUrl={display.avatarUrl}
        />

        <Section title="Identity">
          <FieldRow label="User ID" value={user.id} mono />
          <FieldRow label="Email" value={user.email} mono />
          <FieldRow label="Phone" value={user.phone} mono />
          <FieldRow label="Role" value={user.role} />
          <FieldRow label="Audience" value={user.aud} />
          <FieldRow label="SSO user" value={user.is_sso_user ? "yes" : "no"} />
          <FieldRow
            label="Anonymous"
            value={user.is_anonymous ? "yes" : "no"}
          />
        </Section>

        <Section title="Timestamps">
          <FieldRow label="Created" value={user.created_at} mono />
          <FieldRow label="Updated" value={user.updated_at} mono />
          <FieldRow label="Last sign-in" value={user.last_sign_in_at} mono />
          <FieldRow label="Confirmed" value={user.confirmed_at} mono />
          <FieldRow
            label="Email confirmed"
            value={user.email_confirmed_at}
            mono
          />
          <FieldRow
            label="Phone confirmed"
            value={user.phone_confirmed_at}
            mono
          />
        </Section>

        <Section
          title="User metadata"
          description="Provider-supplied claims, mirrored from Keycloak."
        >
          <div className="p-4">
            <JsonBlock data={user.user_metadata} />
          </div>
        </Section>

        <Section
          title="App metadata"
          description="Server-controlled metadata. `provider` = initial sign-in provider."
        >
          <div className="p-4">
            <JsonBlock data={user.app_metadata} />
          </div>
        </Section>

        <Section
          title={`Identities (${identities.length})`}
          description="Linked OAuth accounts. Keycloak is one provider; more can be attached."
        >
          {identities.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground italic">
              none
            </div>
          ) : (
            identities.map((identity) => (
              <div
                key={identity.identity_id}
                className="flex flex-col gap-3 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {identity.provider}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {identity.identity_id}
                  </span>
                </div>
                <JsonBlock data={identity.identity_data ?? {}} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>created {identity.created_at ?? "—"}</span>
                  <span>last {identity.last_sign_in_at ?? "—"}</span>
                </div>
              </div>
            ))
          )}
        </Section>

        <Section
          title={`MFA factors (${factors.length})`}
          description="TOTP / phone / webauthn enrolments."
        >
          {factors.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground italic">
              none
            </div>
          ) : (
            factors.map((factor) => (
              <div key={factor.id} className="flex flex-col gap-2 p-4 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {factor.friendly_name ?? factor.factor_type}
                  </span>
                  <span className="text-muted-foreground">{factor.status}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span className="font-mono">{factor.id}</span>
                  <span>{factor.factor_type}</span>
                </div>
              </div>
            ))
          )}
        </Section>

        <Section
          title="Session"
          description="Cookie-backed Supabase session. Tokens masked."
        >
          {session ? (
            <>
              <FieldRow label="Token type" value={session.token_type} />
              <FieldRow
                label="Expires at"
                value={formatUnixSeconds(session.expires_at)}
                mono
              />
              <FieldRow
                label="Expires in (s)"
                value={session.expires_in}
                mono
              />
              <FieldRow
                label="Access token"
                value={maskToken(session.access_token)}
                mono
              />
              <FieldRow
                label="Refresh token"
                value={maskToken(session.refresh_token)}
                mono
              />
              <FieldRow
                label="Provider token"
                value={maskToken(session.provider_token)}
                mono
              />
              <FieldRow
                label="Provider refresh token"
                value={maskToken(session.provider_refresh_token)}
                mono
              />
            </>
          ) : (
            <div className="px-4 py-3 text-xs text-muted-foreground italic">
              No session cookie — this shouldn&apos;t happen if you reached this
              page.
            </div>
          )}
        </Section>

        <Section
          title="Raw user object"
          description="Full AuthUser, in case something above got dropped."
        >
          <div className="p-4">
            <JsonBlock data={user} />
          </div>
        </Section>

        <div className="flex justify-end">
          <SignOutButton />
        </div>
      </div>
    </PortalShell>
  )
}
