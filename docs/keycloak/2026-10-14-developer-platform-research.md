# WinLab developer identity platform — research and proposed scope

Status: product direction approved; group access added to scope. The user has
explicitly prohibited Keycloak modifications. Implementation is now available
on `feat/developer-oauth`; see [service documentation](developer-oauth-service.md).
Production migration was applied on 2026-10-14; application deployment remains pending.

## Mandatory boundary

Do not modify Keycloak: no client creation, scope/mapper changes, role grants,
user/group changes, or changes to realm settings. This restriction applies to
manual actions, setup scripts, and the platform's runtime behavior. Use existing
login integration and authorized read-only access. Build an NYCU OAuth-like
service in the portal; do not implement a Keycloak administration frontend.

## Request and repository baseline

Build a platform where lab members register their own applications, connect
to Keycloak, and request user data under the permission rules of NYCU OAuth.
On 2026-10-14, `git pull --ff-only` advanced local main from `86cb227` to
`95e8539`. Existing untracked files were preserved.

## Source rules

Sources read on 2026-10-14:

- https://id.nycu.edu.tw/docs/
- https://id.nycu.edu.tw/policy/
- https://www.keycloak.org/docs/latest/server_admin/index.html

NYCU documents Authorization Code flow and registered redirect URI allowlists.
Its data scopes are:

| Scope     | Data                                      | Approval                |
| --------- | ----------------------------------------- | ----------------------- |
| `profile` | Username and email                        | Basic developer access  |
| `name`    | Username and name                         | Administrative approval |
| `status`  | Username and enrollment/employment status | Administrative approval |

An application requests restricted fields with their purpose. The policy also
requires responsible-party/contact details for additional scopes and normally
limits restricted access to university-developed or maintained systems.
User consent remains necessary after administrative approval. Users can revoke
authorization; applications must delete authorized data according to the policy.
The policy prohibits unauthorized collection, widening access, offline storage
of sensitive data, and passing tokens to others. These are source requirements;
the lab needs its own operator and eligibility definitions.

## Recommended design

Add `/developers` to the existing portal, with application registration,
redirect URI management, connection instructions, restricted-scope requests,
and an administrative review view. Use the existing portal design system.
Use the portal's existing Keycloak-backed sign-in to authenticate members.
Application registration, client credentials, scope review, member consent,
application tokens, data APIs, and revocation belong to the new service.
New developer applications register with this service, not in Keycloak.

Keep application ownership and review records in the portal. Read member data
through existing authorized read-only access. Never expose upstream tokens,
service-account credentials, or a member's Supabase session to an application.

Enforce application approval, requested scope, member consent, and token scope
at the service boundary, with explicit response-field allowlists. Keycloak's
built-in `profile` scope is not NYCU's username/email-only `profile`; upstream
claims must not be forwarded wholesale. Reject unknown or unapproved scopes.

Support Authorization Code with PKCE and exact redirect URI validation.
Browser-only clients must not receive a client secret. Server applications can
use confidential clients. Provide an authorization-management entry point and
document/test revocation behavior, including already-issued access tokens;
do not promise immediate JWT invalidation based solely on consent removal.

The existing Supabase MCP authorization grants the member's full RLS access.
It is unsuitable as the data-permission boundary for this feature.

## Architecture consequence of the read-only constraint

The earlier client-provisioning proposal is superseded. The new service needs
its own application authorization layer while reusing existing member login.
Evaluate a maintained OAuth server implementation before implementing token
handling; it must support the required scope enforcement and revocation without
Keycloak changes or granting applications direct Supabase data access.

## Group access: confirmed realm configuration

The administrator requested the existing group value. Read-only inspection of
the authenticated Safari administration console confirmed these settings in
the `winlab` realm:

- Client scope: `groups`, assigned type `None`, description
  `Group membership (NetBird)`.
- Mapper: `groups`, type `Group Membership`, token claim name `groups`.
- Full group path: off; preserve the existing group-name representation.
- Included in ID token, access token, UserInfo, and introspection; excluded
  from lightweight access tokens.
- Display on consent screen and include in token scope: on.
- The separate `service_account` scope contains Client ID, Client IP Address,
  and Client Host mappers; it has no group mapper in the inspected configuration.

Add `groups` as a restricted permission requiring application-purpose review
by a portal administrator and explicit member consent. Return the signed-in
member's permitted memberships, not the service account's memberships. Basic
profile access must not expose it in any token or data response. The existing
mapper is reference information only; no mapper changes or client-scope
assignments are allowed. The service reads memberships and filters its own
response. No realm settings were changed during inspection.

### User-specified example

Read-only inspection of the supplied member's Groups page showed these four
direct memberships (not a list inferred from the service account's token):

| Group value    | Path                            |
| -------------- | ------------------------------- |
| `114`          | `/lab-member/114`               |
| `master`       | `/lab-member/master`            |
| `cairn`        | `/winlab-projects/cairn`        |
| `wnc-easymesh` | `/winlab-projects/wnc-easymesh` |

Proposed authorized `groups` response for this example:

```json
{
  "groups": ["114", "master", "cairn", "wnc-easymesh"]
}
```

`master` here is a membership below `/lab-member`, not a realm administration
role. Preserve these values without interpreting membership as authorization
to administer the portal. Only the authenticated member's memberships are
eligible for this API. Paths are documented for provenance, not additional
fields implicitly approved for disclosure.

## Decisions still needed

- Approved lab adaptation: portal administrators approve restricted scopes;
  only lab-developed or maintained applications qualify.
- NYCU's enrollment/employment `status` has no confirmed lab equivalent yet.
  Decide whether it means current lab membership, and identify an authoritative
  field before enabling that scope. Do not infer it from an undocumented group.
- Base platform design approved; include the requested restricted `groups`
  permission in the implementation specification.

## Required verification during implementation

Check owner isolation, review permissions, pending/rejected scope denial,
absence of sensitive claims in tokens and UserInfo, redirect validation, PKCE,
consent, revoked/disabled application access, and read-only source failures.
Verify that no feature path writes to Keycloak or forwards upstream credentials.
Run repository typecheck, lint, build, relevant tests, and a real browser flow.
