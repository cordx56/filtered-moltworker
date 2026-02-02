#!/usr/bin/env node
/**
 * Add a domain or IP address directly to the egress allowlist.
 * This script requires exec-approval from the user.
 *
 * Usage:
 *   node add-allowlist.js <domain|ip> [--port <port>] [--reason <reason>] [--ip]
 *
 * Examples:
 *   node add-allowlist.js api.example.com
 *   node add-allowlist.js api.example.com --port 443 --reason "API integration"
 *   node add-allowlist.js 192.168.1.100 --ip --port 22
 *   node add-allowlist.js 10.0.0.0/8 --ip --reason "Internal network"
 *
 * Environment:
 *   EGRESS_ALLOWLIST  Path to allowlist file (default: /etc/egress-filter/allowlist.yaml)
 */

const path = require("path");

const {
  DEFAULT_CONFIG,
  addDomainToAllowlist,
  addIpToAllowlist,
  isValidDomain,
  isValidIp,
  isValidPort,
} = require(path.join(__dirname, "allowlist-utils.js"));

function parseArgs(args) {
  const result = { target: null, ports: [443], reason: null, isIp: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      result.ports = args[i + 1].split(",").map((p) => parseInt(p.trim(), 10));
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

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log("Usage: node add-allowlist.js <domain|ip> [options]");
    console.log("");
    console.log("Add a domain or IP address directly to the egress allowlist.");
    console.log("This action requires exec-approval from the user.");
    console.log("");
    console.log("Options:");
    console.log("  --port <ports>    Port number(s), comma-separated (default: 443)");
    console.log("  --reason <text>   Reason for adding to allowlist");
    console.log("  --ip              Treat target as IP address/CIDR");
    console.log("");
    console.log("Examples:");
    console.log("  node add-allowlist.js api.example.com");
    console.log("  node add-allowlist.js *.example.com --port 443 --reason 'API access'");
    console.log("  node add-allowlist.js 192.168.1.100 --ip --port 22,443");
    console.log("  node add-allowlist.js 10.0.0.0/8 --ip --reason 'Internal network'");
    console.log("");
    console.log("Environment:");
    console.log("  EGRESS_ALLOWLIST  Path to allowlist file");
    process.exit(args.includes("--help") ? 0 : 1);
  }

  const { target, ports, reason, isIp } = parseArgs(args);
  const configPath = process.env.EGRESS_ALLOWLIST || DEFAULT_CONFIG;

  if (!target) {
    console.error("Error: Domain or IP address is required");
    process.exit(1);
  }

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

  if (!isValidPort(ports)) {
    console.error("Error: Invalid port number(s)");
    process.exit(1);
  }

  const comment = "Added via exec-approval";
  let success;

  if (isIp) {
    success = addIpToAllowlist(configPath, target, ports, reason, comment);
  } else {
    success = addDomainToAllowlist(configPath, target, ports, reason, comment);
  }

  if (success) {
    console.log("✓ Successfully added to egress allowlist:");
    console.log("");
    if (isIp) {
      const cidr = target.includes("/") ? target : `${target}/32`;
      console.log(`  CIDR: ${cidr}`);
    } else {
      console.log(`  Domain: ${target}`);
    }
    console.log(`  Ports: ${ports.join(", ")}`);
    if (reason) {
      console.log(`  Reason: ${reason}`);
    }
    console.log("");
    console.log("Note: Restart the gateway to apply changes.");
  } else {
    process.exit(1);
  }
}

main();
