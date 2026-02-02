#!/usr/bin/env node
/**
 * Approve or deny an egress access request.
 * THIS SCRIPT SHOULD ONLY BE RUN BY ADMINISTRATORS.
 *
 * Usage:
 *   node approve-request.js <id>              # Approve a request
 *   node approve-request.js <id> --deny       # Deny a request
 *   node approve-request.js <id> --deny --reason "Not allowed"
 *   node approve-request.js --all             # Approve all pending requests
 *   node approve-request.js --all --deny      # Deny all pending requests
 *
 * Options:
 *   --deny              Deny the request instead of approving
 *   --reason <text>     Reason for denial
 *   --all               Approve all pending requests
 *   --config <path>     Path to allowlist.yaml (default: /etc/egress-filter/allowlist.yaml)
 */

const fs = require("fs");
const path = require("path");

const REQUESTS_DIR = "/var/lib/egress-requests";
const PENDING_DIR = path.join(REQUESTS_DIR, "pending");
const APPROVED_DIR = path.join(REQUESTS_DIR, "approved");
const DENIED_DIR = path.join(REQUESTS_DIR, "denied");
const DEFAULT_CONFIG = "/etc/egress-filter/allowlist.yaml";

function parseArgs(args) {
  const result = {
    id: null,
    deny: false,
    reason: null,
    all: false,
    config: DEFAULT_CONFIG,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--deny") {
      result.deny = true;
    } else if (args[i] === "--all") {
      result.all = true;
    } else if (args[i] === "--reason" && args[i + 1]) {
      result.reason = args[i + 1];
      i++;
    } else if (args[i] === "--config" && args[i + 1]) {
      result.config = args[i + 1];
      i++;
    } else if (!args[i].startsWith("--") && !result.id) {
      result.id = args[i];
    }
  }

  return result;
}

function ensureDirectories() {
  for (const dir of [APPROVED_DIR, DENIED_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function loadRequest(id) {
  const filepath = path.join(PENDING_DIR, `${id}.json`);
  if (!fs.existsSync(filepath)) {
    // Try to find by partial ID
    const files = fs.readdirSync(PENDING_DIR);
    const match = files.find((f) => f.startsWith(id) && f.endsWith(".json"));
    if (match) {
      return JSON.parse(fs.readFileSync(path.join(PENDING_DIR, match), "utf-8"));
    }
    return null;
  }
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

function loadAllPending() {
  if (!fs.existsSync(PENDING_DIR)) return [];

  const requests = [];
  const files = fs.readdirSync(PENDING_DIR);

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = fs.readFileSync(path.join(PENDING_DIR, file), "utf-8");
      requests.push(JSON.parse(content));
    } catch {
      // Ignore invalid files
    }
  }

  return requests;
}

function moveRequest(request, fromDir, toDir) {
  const srcPath = path.join(fromDir, `${request.id}.json`);
  const destPath = path.join(toDir, `${request.id}.json`);

  fs.writeFileSync(destPath, JSON.stringify(request, null, 2));
  if (fs.existsSync(srcPath)) {
    fs.unlinkSync(srcPath);
  }
}

function addDomainToAllowlist(configPath, domain, port, reason) {
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Config file not found: ${configPath}`);
    return false;
  }

  let content = fs.readFileSync(configPath, "utf-8");

  // Check if domain is already in allowlist
  if (content.includes(`pattern: "${domain}"`) || content.includes(`pattern: '${domain}'`)) {
    console.log(`  Domain ${domain} is already in the allowlist`);
    return true;
  }

  // Find the domains section and append the new rule
  const domainsMatch = content.match(/^domains:\s*$/m);
  if (!domainsMatch) {
    console.error("Error: Could not find 'domains:' section in config");
    return false;
  }

  // Build the new rule
  const indent = "  ";
  let newRule = `\n${indent}# Added via egress-request approval\n`;
  newRule += `${indent}- pattern: "${domain}"\n`;
  newRule += `${indent}  ports: [${port}]\n`;
  if (reason) {
    // Escape special characters in reason for YAML
    const safeReason = reason.replace(/"/g, '\\"');
    newRule += `${indent}  reason: "${safeReason}"\n`;
  }

  // Find position after "domains:" line
  const insertPos = domainsMatch.index + domainsMatch[0].length;

  // Insert the new rule
  content = content.slice(0, insertPos) + newRule + content.slice(insertPos);

  // Write back
  fs.writeFileSync(configPath, content);
  return true;
}

function addIpToAllowlist(configPath, ip, port, reason) {
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Config file not found: ${configPath}`);
    return false;
  }

  let content = fs.readFileSync(configPath, "utf-8");

  // Check if IP is already in allowlist
  if (content.includes(`cidr: "${ip}"`) || content.includes(`cidr: '${ip}'`)) {
    console.log(`  IP ${ip} is already in the allowlist`);
    return true;
  }

  // Find the ip_ranges section and append the new rule
  const ipRangesMatch = content.match(/^ip_ranges:\s*$/m);
  if (!ipRangesMatch) {
    console.error("Error: Could not find 'ip_ranges:' section in config");
    return false;
  }

  // Build the new rule
  const indent = "  ";
  let newRule = `\n${indent}# Added via egress-request approval\n`;
  newRule += `${indent}- cidr: "${ip}"\n`;
  if (port) {
    newRule += `${indent}  ports: [${port}]\n`;
  }
  if (reason) {
    // Escape special characters in reason for YAML
    const safeReason = reason.replace(/"/g, '\\"');
    newRule += `${indent}  reason: "${safeReason}"\n`;
  }

  // Find position after "ip_ranges:" line
  const insertPos = ipRangesMatch.index + ipRangesMatch[0].length;

  // Insert the new rule
  content = content.slice(0, insertPos) + newRule + content.slice(insertPos);

  // Write back
  fs.writeFileSync(configPath, content);
  return true;
}

function approveRequest(request, configPath) {
  const target = request.domain || request.ip;
  const isIp = !!request.ip;
  console.log(`Approving request: ${target}:${request.port}`);

  // Add to allowlist (domain or IP)
  let success;
  if (isIp) {
    success = addIpToAllowlist(configPath, request.ip, request.port, request.reason);
  } else {
    success = addDomainToAllowlist(configPath, request.domain, request.port, request.reason);
  }

  if (!success) {
    console.error("  Failed to add to allowlist");
    return false;
  }

  // Update request status
  request.status = "approved";
  request.approved_at = new Date().toISOString();

  // Move to approved directory
  moveRequest(request, PENDING_DIR, APPROVED_DIR);

  console.log(`  Added ${target}:${request.port} to allowlist`);
  console.log("  Request approved and archived");
  return true;
}

function denyRequest(request, reason) {
  const target = request.domain || request.ip;
  console.log(`Denying request: ${target}:${request.port}`);

  // Update request status
  request.status = "denied";
  request.denied_at = new Date().toISOString();
  if (reason) {
    request.deny_reason = reason;
  }

  // Move to denied directory
  moveRequest(request, PENDING_DIR, DENIED_DIR);

  console.log("  Request denied and archived");
  return true;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log("Usage: node approve-request.js <id> [options]");
    console.log("");
    console.log("Approve or deny an egress access request.");
    console.log("THIS SCRIPT SHOULD ONLY BE RUN BY ADMINISTRATORS.");
    console.log("");
    console.log("Options:");
    console.log("  --deny              Deny the request");
    console.log("  --reason <text>     Reason for denial");
    console.log("  --all               Approve all pending requests");
    console.log("  --config <path>     Path to allowlist.yaml");
    console.log("");
    console.log("Examples:");
    console.log("  node approve-request.js abc123");
    console.log("  node approve-request.js abc123 --deny --reason 'Security risk'");
    console.log("  node approve-request.js --all");
    process.exit(args.includes("--help") ? 0 : 1);
  }

  const { id, deny, reason, all, config } = parseArgs(args);

  if (!id && !all) {
    console.error("Error: Request ID or --all is required");
    process.exit(1);
  }

  try {
    ensureDirectories();

    if (all) {
      // Approve or deny all pending requests
      const pending = loadAllPending();
      if (pending.length === 0) {
        console.log(deny ? "No pending requests to deny." : "No pending requests to approve.");
        return;
      }

      const action = deny ? "Denying" : "Approving";
      console.log(`${action} ${pending.length} pending request(s)...\n`);
      let success = 0;
      let failed = 0;

      for (const request of pending) {
        const result = deny
          ? denyRequest(request, reason)
          : approveRequest(request, config);
        if (result) {
          success++;
        } else {
          failed++;
        }
        console.log("");
      }

      const actionDone = deny ? "denied" : "approved";
      console.log(`Done: ${success} ${actionDone}, ${failed} failed`);
      if (!deny && success > 0) {
        console.log("\nNOTE: Restart the gateway to apply changes.");
      }
      return;
    }

    // Single request
    const request = loadRequest(id);
    if (!request) {
      console.error(`Error: Request not found: ${id}`);
      console.log("\nUse 'node list-requests.js' to see pending requests.");
      process.exit(1);
    }

    if (deny) {
      denyRequest(request, reason);
    } else {
      if (approveRequest(request, config)) {
        console.log("\nNOTE: Restart the gateway to apply changes.");
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
