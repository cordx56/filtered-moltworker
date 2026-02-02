---
name: egress-request
description: Check blocked connections and request access for hosts that need to be added to the egress allowlist. Use when network requests fail due to egress filtering.
metadata: {"openclaw":{"requires":{"bins":["node"]}}}
---

# Egress Request Skill

This skill helps detect blocked connections and create access requests. Requests require human approval before being added to the allowlist.

## Workflow

1. **Check blocked connections** - Use `check-blocks.js` to see what's being blocked
2. **Create access request** - Use `request-access.js` to request access
3. **Human approves via Admin UI** - Navigate to `/_admin/` -> Egress Requests tab
4. **Allowlist updated** - Only after human approval (via `egress-admin` skill)

## Scripts

### check-blocks.js

Check the egress filter log for blocked connections:

```bash
node {baseDir}/scripts/check-blocks.js
node {baseDir}/scripts/check-blocks.js --json
node {baseDir}/scripts/check-blocks.js --clear
```

Options:
- `--json` - Output in JSON format
- `--clear` - Clear the log after reading

### request-access.js

Create an access request for a blocked host:

```bash
node {baseDir}/scripts/request-access.js api.example.com
node {baseDir}/scripts/request-access.js api.example.com --port 443 --reason "API integration"
node {baseDir}/scripts/request-access.js 192.168.1.100 --ip --port 22
node {baseDir}/scripts/request-access.js 10.0.0.0/8 --ip --reason "Internal network"
```

Options:
- `--port <port>` - Port number (default: 443)
- `--reason <text>` - Reason for the request
- `--ip` - Treat target as IP address (supports CIDR)

### list-requests.js

List pending access requests:

```bash
node {baseDir}/scripts/list-requests.js
node {baseDir}/scripts/list-requests.js --json
node {baseDir}/scripts/list-requests.js --all
```

Options:
- `--json` - Output in JSON format
- `--all` - Include approved/denied requests

## File Locations

- Blocked connections log: `/var/log/egress-filter.log`
- Pending requests: `/var/lib/egress-requests/pending/`
- Approved requests: `/var/lib/egress-requests/approved/`
- Denied requests: `/var/lib/egress-requests/denied/`

## Approval

Requests are approved through the **egress-admin** skill (admin-only) or the Admin UI.

This skill can only **check** and **request** - it cannot modify the allowlist directly.
