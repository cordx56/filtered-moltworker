#!/usr/bin/env node
/**
 * Request access for a blocked domain.
 * Creates a pending request that must be approved by a human.
 *
 * Usage:
 *   node request-access.js <domain> [--port <port>] [--reason <reason>]
 *
 * Examples:
 *   node request-access.js api.example.com
 *   node request-access.js api.example.com --port 443 --reason "Required for API integration"
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REQUESTS_DIR = "/var/lib/egress-requests";
const PENDING_DIR = path.join(REQUESTS_DIR, "pending");

function parseArgs(args) {
  const result = { domain: null, port: 443, reason: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      result.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--reason" && args[i + 1]) {
      result.reason = args[i + 1];
      i++;
    } else if (!args[i].startsWith("--") && !result.domain) {
      result.domain = args[i];
    }
  }

  return result;
}

function ensureDirectories() {
  if (!fs.existsSync(REQUESTS_DIR)) {
    fs.mkdirSync(REQUESTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(PENDING_DIR)) {
    fs.mkdirSync(PENDING_DIR, { recursive: true });
  }
}

function isIpAddress(str) {
  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str)) {
    return true;
  }
  // IPv6
  if (/^[0-9a-fA-F:]+$/.test(str) && str.includes(":")) {
    return true;
  }
  return false;
}

function isValidDomain(domain) {
  // Must not be an IP address
  if (isIpAddress(domain)) {
    return false;
  }
  // Basic domain validation
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(domain);
}

function isDuplicateRequest(domain, port) {
  if (!fs.existsSync(PENDING_DIR)) return false;

  const files = fs.readdirSync(PENDING_DIR);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = fs.readFileSync(path.join(PENDING_DIR, file), "utf-8");
      const request = JSON.parse(content);
      if (request.domain === domain && request.port === port) {
        return true;
      }
    } catch {
      // Ignore invalid files
    }
  }
  return false;
}

function createRequest(domain, port, reason) {
  const id = crypto.randomUUID();
  const request = {
    id,
    domain,
    port,
    reason: reason || `Access requested for ${domain}:${port}`,
    requested_at: new Date().toISOString(),
    status: "pending",
  };

  const filename = `${id}.json`;
  const filepath = path.join(PENDING_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(request, null, 2));

  return request;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log("Usage: node request-access.js <domain> [--port <port>] [--reason <reason>]");
    console.log("");
    console.log("Creates a pending access request for a blocked domain.");
    console.log("The request must be approved by an administrator via Admin UI.");
    console.log("");
    console.log("Options:");
    console.log("  --port <port>     Port number (default: 443)");
    console.log("  --reason <text>   Reason for the request");
    console.log("");
    console.log("Note: IP addresses are not accepted. Only domain names can be requested.");
    process.exit(args.includes("--help") ? 0 : 1);
  }

  const { domain, port, reason } = parseArgs(args);

  if (!domain) {
    console.error("Error: Domain is required");
    process.exit(1);
  }

  // Check if it's an IP address
  if (isIpAddress(domain)) {
    console.error("Error: IP addresses are not accepted. Please provide a domain name.");
    console.error("Example: api.example.com");
    process.exit(1);
  }

  // Validate domain format
  if (!isValidDomain(domain)) {
    console.error("Error: Invalid domain format");
    console.error("Domain must be a valid hostname like: api.example.com");
    process.exit(1);
  }

  // Validate port
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("Error: Invalid port number");
    process.exit(1);
  }

  try {
    ensureDirectories();

    // Check for duplicate
    if (isDuplicateRequest(domain, port)) {
      console.log(`A request for ${domain}:${port} is already pending.`);
      console.log("Please wait for administrator approval via Admin UI.");
      return;
    }

    const request = createRequest(domain, port, reason);

    console.log("Access request created successfully!");
    console.log("");
    console.log(`  Domain: ${request.domain}`);
    console.log(`  Port: ${request.port}`);
    console.log(`  Reason: ${request.reason}`);
    console.log(`  Request ID: ${request.id}`);
    console.log("");
    console.log("The request is now pending administrator approval via Admin UI.");
  } catch (err) {
    console.error(`Error creating request: ${err.message}`);
    process.exit(1);
  }
}

main();
