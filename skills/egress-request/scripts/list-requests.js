#!/usr/bin/env node
/**
 * List pending egress access requests.
 *
 * Usage:
 *   node list-requests.js [--json] [--all]
 *
 * Options:
 *   --json  Output in JSON format
 *   --all   Include approved/denied requests
 */

const fs = require("fs");
const path = require("path");

const REQUESTS_DIR = "/var/lib/egress-requests";
const PENDING_DIR = path.join(REQUESTS_DIR, "pending");
const APPROVED_DIR = path.join(REQUESTS_DIR, "approved");
const DENIED_DIR = path.join(REQUESTS_DIR, "denied");

function loadRequests(dir) {
  if (!fs.existsSync(dir)) return [];

  const requests = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      requests.push(JSON.parse(content));
    } catch {
      // Ignore invalid files
    }
  }

  // Sort by requested_at descending (newest first)
  requests.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));

  return requests;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const showAll = args.includes("--all");

  const pending = loadRequests(PENDING_DIR);
  const approved = showAll ? loadRequests(APPROVED_DIR) : [];
  const denied = showAll ? loadRequests(DENIED_DIR) : [];

  if (jsonOutput) {
    const output = { pending };
    if (showAll) {
      output.approved = approved;
      output.denied = denied;
    }
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Text output
  if (pending.length === 0 && approved.length === 0 && denied.length === 0) {
    console.log("No access requests found.");
    return;
  }

  if (pending.length > 0) {
    console.log("=== Pending Requests ===\n");
    for (const req of pending) {
      console.log(`  ID: ${req.id}`);
      console.log(`  Domain: ${req.domain}:${req.port}`);
      console.log(`  Reason: ${req.reason}`);
      console.log(`  Requested: ${formatDate(req.requested_at)}`);
      console.log("");
    }
    console.log(`Total: ${pending.length} pending request(s)\n`);
    console.log("Approval is done via Admin UI (/_admin/ -> Egress Requests tab)\n");
  } else {
    console.log("No pending requests.\n");
  }

  if (showAll && approved.length > 0) {
    console.log("=== Approved Requests ===\n");
    for (const req of approved) {
      console.log(`  ${req.domain}:${req.port} - ${req.reason}`);
      console.log(`    Approved: ${formatDate(req.approved_at || req.requested_at)}`);
    }
    console.log("");
  }

  if (showAll && denied.length > 0) {
    console.log("=== Denied Requests ===\n");
    for (const req of denied) {
      console.log(`  ${req.domain}:${req.port} - ${req.reason}`);
      console.log(`    Denied: ${formatDate(req.denied_at || req.requested_at)}`);
      if (req.deny_reason) {
        console.log(`    Reason: ${req.deny_reason}`);
      }
    }
    console.log("");
  }
}

main();
