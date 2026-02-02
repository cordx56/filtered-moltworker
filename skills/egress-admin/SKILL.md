---
name: egress-admin
description: Admin-only scripts for egress allowlist management. Requires exec-approval. NOT accessible to AI agents.
user-invocable: false
disable-model-invocation: true
metadata: {"openclaw":{"requires":{"bins":["node"]}}}
---

# Egress Admin Skill

**This skill is NOT accessible to AI agents.** It provides administrative scripts for managing the egress allowlist directly.

## Security

- `user-invocable: false` - Cannot be invoked via slash commands
- `disable-model-invocation: true` - Model cannot auto-invoke this skill
- All scripts require exec-approval from the user

## Scripts

### add-allowlist.js

Add a domain or IP directly to the egress allowlist:

```bash
node {baseDir}/add-allowlist.js api.example.com
node {baseDir}/add-allowlist.js *.example.com --port 443 --reason "API access"
node {baseDir}/add-allowlist.js 192.168.1.100 --ip --port 22,443
node {baseDir}/add-allowlist.js 10.0.0.0/8 --ip --reason "Internal network"
```

Options:
- `--port <ports>` - Port number(s), comma-separated (default: 443)
- `--reason <text>` - Reason for adding to allowlist
- `--ip` - Treat target as IP address/CIDR

Environment:
- `EGRESS_ALLOWLIST` - Path to allowlist file (default: /etc/egress-filter/allowlist.yaml)

### approve-request.js

Approve or deny pending egress access requests:

```bash
node {baseDir}/approve-request.js <request-id>
node {baseDir}/approve-request.js <request-id> --deny
node {baseDir}/approve-request.js <request-id> --deny --reason "Security risk"
node {baseDir}/approve-request.js --all
node {baseDir}/approve-request.js --all --deny
```

Options:
- `--deny` - Deny the request instead of approving
- `--reason <text>` - Reason for denial
- `--all` - Process all pending requests
- `--config <path>` - Path to allowlist.yaml

## File Locations

- Allowlist config: `/etc/egress-filter/allowlist.yaml`
- Pending requests: `/var/lib/egress-requests/pending/`
- Approved requests: `/var/lib/egress-requests/approved/`
- Denied requests: `/var/lib/egress-requests/denied/`

## Integration with egress-request Skill

This skill works alongside the `egress-request` skill:

1. **egress-request** (bot-accessible): Check blocks, create requests, list requests
2. **egress-admin** (admin-only): Approve requests, add to allowlist directly

The separation ensures AI agents can only request access, not grant it.
