# ESIP Enterprise Intelligence PWA

ESIP Local runs as a two-service Docker Compose application:

- `web`: installable PWA, frontend, admin area, D1 role/confirmation/audit state
- `apply-bridge`: local-only governed adapter for immediate ESIP apply operations

## Start and stop

From the workspace root:

- Double-click `Start_ESIP_Local.cmd`
- Open `http://localhost:3000`
- Double-click `Stop_ESIP_Local.cmd` when finished

The Docker volumes keep PWA role, confirmation, and audit state between restarts.

## Login and authentication

1. Open `http://localhost:3000` on the server for the first-time setup.
2. Enter an existing Administrator email, then create a password of at least 10 characters and a 6-digit fallback PIN.
3. Sign in with the ESIP account or PIN. Administrators can reset credentials and manage account status in User Management.

Passwords and PINs are stored as salted PBKDF2-SHA256 hashes. Sessions use an
opaque server-side token in an HttpOnly, SameSite=Strict cookie and expire after
8 hours. Failed login attempts are audited and trigger temporary lockout.
Rate limiting is enforced server-side per account and per IP in a 15-minute
window. PIN login allows 5 attempts per account and 20 per IP; password/AD
login allows 10 per account and 30 per IP. The existing account lock applies
after 5 invalid credentials and requires an Administrator to restore a suspended
account after repeated failures.

Windows AD login requires `ESIP_AD_GATEWAY_URL` and `ESIP_AD_GATEWAY_KEY`.
The ESIP server forwards the credential to that gateway for verification and
never stores the AD password.

## Roles

- `ADMINISTRATOR`: all frontend, confirmation, audit, user-role, and settings access
- `SALE_ADMIN`: all sales-facing data, confirmation, and audit access; no settings
- `USER`: frontend dashboard and source information only

The previous localhost role selector is disabled by default. It is available
only when `ESIP_LOCAL_TRIAL=true`; normal use resolves the role from the signed-in
user and the server-side `admin_users` table.

## Immediate apply

Administrator and Sale Admin approvals follow this order:

1. Validate the item against the current governed queue.
2. Apply using the existing ESIP governance code.
3. Retain the governance backup and file audit.
4. Mark the PWA confirmation as approved/applied and append its audit event.

If validation or apply fails, the PWA record remains pending. Summary rows that
do not identify one governed source item cannot be applied as one transaction.

## Developer validation

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run db:generate
```
