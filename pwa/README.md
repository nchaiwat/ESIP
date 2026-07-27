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

## Roles

- `ADMINISTRATOR`: all frontend, confirmation, audit, user-role, and settings access
- `SALE_ADMIN`: all sales-facing data, confirmation, and audit access; no settings
- `USER`: frontend dashboard and source information only

The localhost role selector exists for trial use. The private hosted site resolves
roles from the authenticated email and the server-side `admin_users` table.

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
