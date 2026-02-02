---
name: egress-request
description: Check blocked connections and request access for hosts that need to be added to the egress allowlist. Use when network requests fail due to egress filtering. Requests require human approval via Admin UI before being added to the allowlist.
---

# Egress Request Skill

This skill helps detect blocked connections and create access requests. All requests require human approval via the Admin UI.

## Workflow

1. **AI detects blocked connection** (via `check-blocks.js`)
2. **AI creates access request** (via `request-access.js`)
3. **Human reviews and approves/denies via Admin UI** (`/_admin/` -> Egress Requests tab)
4. **Allowlist is updated** (only after human approval)

## Scripts

### check-blocks.js

Check the egress filter log for blocked connections:

```bash
node /root/clawd/skills/egress-request/scripts/check-blocks.js
node /root/clawd/skills/egress-request/scripts/check-blocks.js --json
node /root/clawd/skills/egress-request/scripts/check-blocks.js --clear
```

### request-access.js

Create an access request for a blocked host:

```bash
node /root/clawd/skills/egress-request/scripts/request-access.js api.example.com
node /root/clawd/skills/egress-request/scripts/request-access.js api.example.com --port 443 --reason "API integration"
```

This creates a pending request that requires human approval via Admin UI.

### list-requests.js

List pending access requests:

```bash
node /root/clawd/skills/egress-request/scripts/list-requests.js
node /root/clawd/skills/egress-request/scripts/list-requests.js --json
```

## Approval Process

Approval is handled exclusively through the Admin UI:

1. Navigate to `/_admin/`
2. Click the "Egress Requests" tab
3. Review pending requests
4. Click "Approve" or "Deny" for each request
5. Restart the gateway to apply changes

**Note:** There is no CLI command for approval. This ensures human oversight for all allowlist changes.

## File Locations

- Blocked connections log: `/var/log/egress-filter.log`
- Pending requests: `/var/lib/egress-requests/pending/`
- Approved requests: `/var/lib/egress-requests/approved/`
- Denied requests: `/var/lib/egress-requests/denied/`

## Security

- **AI can only create requests** - it cannot approve or modify the allowlist
- **Human approval is required** - via Admin UI with Cloudflare Access authentication
- **Audit trail** - all requests are archived with timestamps
