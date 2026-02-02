---
name: egress-request
description: Check egress filter blocked connections and report hosts that need to be added to the allowlist. Use when network requests fail or when users want to check what hosts were blocked.
---

# Egress Request Skill

This skill reads the egress filter log and reports blocked connection attempts.
Users can use this information to request that specific hosts be added to the egress allowlist.

## Usage

Run the check-blocks script to see recently blocked hosts:

```bash
node /root/clawd/skills/egress-request/scripts/check-blocks.js
```

### Options

- `--clear` - Clear the log after reading (useful after reviewing blocks)
- `--json` - Output in JSON format

## Output

The script outputs a list of blocked hosts with their ports. Example:

```
Blocked connections detected:
- api.example.com:443
- cdn.another-site.net:443

To request access, please contact the administrator with the host names above.
```

## Log Location

Blocked connections are logged to `/var/log/egress-filter.log`
