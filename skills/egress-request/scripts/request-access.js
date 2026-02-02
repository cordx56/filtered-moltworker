#!/usr/bin/env node
/**
 * Request access for a blocked domain or IP address.
 * Creates a pending request that must be approved by a human.
 *
 * Usage:
 *   node request-access.js <domain|ip> [--port <port>] [--reason <reason>] [--ip]
 *
 * Examples:
 *   node request-access.js api.example.com
 *   node request-access.js api.example.com --port 443 --reason "Required for API integration"
 *   node request-access.js 192.168.1.100 --ip --port 22
 *   node request-access.js 10.0.0.0/8 --ip --reason "Internal network"
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REQUESTS_DIR = "/var/lib/egress-requests";
const PENDING_DIR = path.join(REQUESTS_DIR, "pending");

function parseArgs(args) {
  const result = { target: null, port: 443, reason: null, isIp: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      result.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--reason" && args[i + 1]) {
      result.reason = args[i + 1];
      i++;
    } else if (args[i] === "--ip") {
      result.isIp = true;
    } else if (!args[i].startsWith("--") && !result.target) {
      result.target = args[i];
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

function isValidDomain(domain) {
  // Allow wildcards like *.example.com
  const pattern = /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
  return pattern.test(domain);
}

function isValidIp(ip) {
  // IPv4 with optional CIDR: 192.168.1.1 or 192.168.1.0/24
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  // IPv6 with optional CIDR
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\/\d{1,3})?$/;

  if (ipv4Pattern.test(ip)) {
    const [addr, prefix] = ip.split("/");
    const octets = addr.split(".").map(Number);
    if (octets.some((o) => o < 0 || o > 255)) return false;
    if (prefix !== undefined) {
      const prefixNum = Number(prefix);
      if (prefixNum < 0 || prefixNum > 32) return false;
    }
    return true;
  }

  return ipv6Pattern.test(ip);
}

function isDuplicateRequest(target, port, isIp) {
  if (!fs.existsSync(PENDING_DIR)) return false;

  const files = fs.readdirSync(PENDING_DIR);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = fs.readFileSync(path.join(PENDING_DIR, file), "utf-8");
      const request = JSON.parse(content);
      const requestTarget = isIp ? request.ip : request.domain;
      if (requestTarget === target && request.port === port) {
        return true;
      }
    } catch {
      // Ignore invalid files
    }
  }
  return false;
}

function createRequest(target, port, reason, isIp) {
  const id = crypto.randomUUID();
  const request = {
    id,
    port,
    reason: reason || `Access requested for ${target}:${port}`,
    requested_at: new Date().toISOString(),
    status: "pending",
  };

  // Set domain or ip based on type
  if (isIp) {
    request.ip = target;
  } else {
    request.domain = target;
  }

  const filename = `${id}.json`;
  const filepath = path.join(PENDING_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(request, null, 2));

  return request;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log("Usage: node request-access.js <domain|ip> [options]");
    console.log("");
    console.log("Creates a pending access request for a blocked domain or IP.");
    console.log("The request must be approved by an administrator via Admin UI.");
    console.log("");
    console.log("Options:");
    console.log("  --port <port>     Port number (default: 443)");
    console.log("  --reason <text>   Reason for the request");
    console.log("  --ip              Treat target as IP address (supports CIDR)");
    console.log("");
    console.log("Examples:");
    console.log("  node request-access.js api.example.com");
    console.log("  node request-access.js *.example.com --port 443");
    console.log("  node request-access.js 192.168.1.100 --ip --port 22");
    console.log("  node request-access.js 10.0.0.0/8 --ip");
    process.exit(args.includes("--help") ? 0 : 1);
  }

  const { target, port, reason, isIp } = parseArgs(args);

  if (!target) {
    console.error("Error: Domain or IP address is required");
    process.exit(1);
  }

  // Validate based on type
  if (isIp) {
    if (!isValidIp(target)) {
      console.error("Error: Invalid IP address format");
      console.error("Examples: 192.168.1.100, 10.0.0.0/8, 2001:db8::1");
      process.exit(1);
    }
  } else {
    if (!isValidDomain(target)) {
      console.error("Error: Invalid domain format");
      console.error("Examples: api.example.com, *.example.com");
      process.exit(1);
    }
  }

  // Validate port
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("Error: Invalid port number");
    process.exit(1);
  }

  try {
    ensureDirectories();

    // Check for duplicate
    if (isDuplicateRequest(target, port, isIp)) {
      console.log(`A request for ${target}:${port} is already pending.`);
      console.log("Please wait for administrator approval via Admin UI.");
      return;
    }

    const request = createRequest(target, port, reason, isIp);

    console.log("Access request created successfully!");
    console.log("");
    if (isIp) {
      console.log(`  IP: ${request.ip}`);
    } else {
      console.log(`  Domain: ${request.domain}`);
    }
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
