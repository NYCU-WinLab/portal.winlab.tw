# WinLab developer OAuth service

The portal hosts application registration, scope review, member consent, OAuth
codes/tokens, revocation and scope-limited identity APIs. Keycloak remains the
existing upstream login and read-only identity source. This feature does not
create or update Keycloak clients, scopes, mappers, roles, users or groups.

## Routes

| Route                          | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `/developers`                  | Register and list owned applications                     |
| `/developers/[id]`             | Edit application, request scopes, rotate secret, disable |
| `/developers/review`           | Portal administrator review and application controls     |
| `/developers/authorizations`   | Member's consent grants and revocation                   |
| `/developers/docs`             | Application integration instructions                     |
| `/developers/authorize`        | Authenticated consent screen                             |
| `/api/developers/oauth/token`  | Authorization code exchange and refresh                  |
| `/api/developers/oauth/revoke` | Revoke the presented token's consent grant               |
| `/api/developers/profile`      | Username and email; requires `profile`                   |
| `/api/developers/name`         | Username and name; requires approved `name`              |
| `/api/developers/groups`       | Username and lab group names; requires approved `groups` |

This is OAuth 2.0 with Authorization Code and S256 PKCE, not an OIDC issuer.
It does not issue an ID token or accept Supabase/Keycloak tokens as application
bearer tokens. The existing MCP consent flow is independent.

## Permission boundary

- Members own their applications; Portal administrators review requests and
  can suspend applications or revoke their restricted scopes.
- `profile` is username/email only. `name` and `groups` require administrator
  approval **and** the member's explicit consent. No `status` scope is exposed
  until the lab's status definition is settled.
- Resource APIs resolve the member from the opaque token's stored consent grant,
  and resolve their Keycloak subject from the server-managed provider identity.
  Applications cannot supply another member's identifier.
- Group values come from direct user memberships in `/lab-member/` and
  `/winlab-projects/`, filtered to one level below those roots. Example:
  `114`, `master`, `cairn`, `wnc-easymesh`. They are not admin-role claims.
- Basic access never forwards name, groups, roles or upstream token metadata.
- Source errors return 503; a disabled/missing source member is not returned.
- Database errors deny access; browser errors do not expose database details.

## Credentials and revocation

The service uses `@node-oauth/oauth2-server` 5.3.1 for protocol validation.
Client secrets and opaque codes/tokens contain 256 random bits; only SHA-256
hashes are stored. Public clients have no secret. Confidential clients receive
a secret once and must keep it server-side.

Authorization codes expire after 2 minutes, require exact registered redirects,
state and S256 PKCE, and are atomically consumed. A failed PKCE attempt consumes
the code. Access tokens expire after 10 minutes; refresh rotates both tokens
and cannot increase scope. Consumed refresh hashes are retained until the grant
ends; reuse revokes the entire grant, including any successor tokens. A consent
grant has a maximum lifetime of 30 days.

Each API call checks the current grant, app status and scope allowlist. Deleting
a grant cascades to codes and token pairs. Foreign keys stop a racing exchange
from resurrecting a deleted grant. Changes to secret, redirect URIs, approved
scopes, owner or client type, and disabling an app revoke existing grants.
Only administrators can re-enable an application. Revoking any current token
revokes its grant; unknown tokens return success without revealing existence.

Token and data responses are `no-store`. Browser requests are only permitted
from the origins of registered redirect URIs; responses never enable cookies
through CORS. Redirects allow HTTPS or HTTP loopback for local development,
with no wildcard, credentials or fragment.

## Storage and operations

Migration: `20261014061339_developer_oauth.sql`.

Five RLS-enabled tables store apps, review requests, grants, codes and token
pairs. Authenticated users have scoped metadata reads, no direct writes, and no
access to secret hashes, codes or tokens. The server explicitly checks session,
owner and administrator permission before privileged writes. The review RPC
also independently checks the authenticated administrator in Postgres, locks
pending requests, and records reviewer, timestamp and decision.

Deployment uses existing environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)
- `KEYCLOAK_URL`, `KEYCLOAK_REALM`
- `KEYCLOAK_READ_CLIENT_ID`, `KEYCLOAK_READ_CLIENT_SECRET` (existing view-users)
- `NEXT_PUBLIC_SITE_URL` for the documentation's endpoint examples

Apply the reviewed migration before releasing the application routes. No
Keycloak setup or mutation is part of deployment. The migration was applied to the production Portal Supabase project on
2026-10-14 (version `20261014061339`) and the RLS/credential access boundary
was verified. The application release is still pending deployment access.
Expired grants and unused expired codes may be periodically deleted by the
operator; authorization rejects them regardless of physical retention.

## Verification

Focused Bun tests exercise the real OAuth library, code replay and PKCE failures,
confidential clients, refresh rotation, scope isolation, response field allowlists,
source failures, grant revocation, CORS and cross-client revocation isolation.
Postgres pgTAP tests cover direct-access privileges, ownership/consent RLS,
administrator review/audit and revocation cascades.

Local browser verification uses disposable users in local Supabase and covers
application registration → scope request → admin approval → member consent →
token exchange → scope denial → revocation. It also checks mobile layout and
the integration guide. Keycloak source response shaping is covered with test
fixtures; a live production member-data call has not been exercised.

Reference policy: [NYCU documentation](https://id.nycu.edu.tw/docs/) and
[terms](https://id.nycu.edu.tw/policy/). `groups` is the lab-specific restricted
scope added to that model.

Verified locally on 2026-10-14: 1,246 Portal tests and 965 database assertions
passed, typecheck and production build passed. Lint finished with zero errors
and 25 existing warnings outside this feature. The browser flow passed with
no console errors, including a pending review behind 100 resolved requests.

A standalone consumer app is available alongside the repository at
`../winlab-oauth-demo`. Its browser integration passed registration, admin
review, member consent, profile/groups reads, token refresh and grant revocation
against the real local Portal routes and Postgres, with an isolated identity
fixture. Screenshots and setup instructions are in the demo directory.

## MCP management

The existing `/api/mcp` now exposes `list_developer_apps`, `get_developer_app`,
`register_developer_app`, `request_developer_scopes`, and
`get_developer_integration`. Use the existing Portal/Supabase MCP login, not an
application's opaque token. All five tools are limited to the caller's own apps,
including for administrators. Registration and scope requests share the web's
validation and mutation functions; reads use the caller's RLS client and exclude
secret hashes. Only initial confidential registration returns its one-time
secret. Approval remains on the administrator review page.

MCP integration was verified through actual HTTP `/api/mcp` calls against local
Supabase: list, register, one-time secret, pending scope request, integration
metadata, and denial for another owner's app. No additional migration is needed.
