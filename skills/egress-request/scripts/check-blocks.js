#!/usr/bin/env node
/**
 * Check egress filter blocked connections and report domains/IPs that need allowlist access.
 *
 * Usage:
 *   node check-blocks.js [--clear] [--json]
 *
 * Options:
 *   --clear  Clear the log after reading
 *   --json   Output in JSON format
 */

const fs = require("fs");

const LOG_FILE = "/var/log/egress-filter.log";

// Check if a string looks like an IP address
function isIpAddress(str) {
  // IPv4 (with optional CIDR)
  if (/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(str)) {
    return true;
  }
  // IPv6
  if (/^[0-9a-fA-F:]+$/.test(str) && str.includes(":")) {
    return true;
  }
  return false;
}

// Pattern to match egress-filter blocked messages
// Examples:
//   [egress-filter] Connection blocked: 1.2.3.4:443 (example.com)
//   [egress-filter] Connection blocked: 1.2.3.4:443
//   [egress-filter] DNS query blocked: 1.2.3.4:53 (example.com)
//   [egress-filter] DoH query blocked: example.com
const BLOCKED_PATTERNS = [
  // Connection/DNS query with hostname in parentheses - extract domain
  // IPv4: 1.2.3.4:443 (example.com)
  // IPv6: 2001:db8::1:443 (example.com) - port is the last number after final colon
  {
    pattern: /\[egress-filter\] (?:Connection|DNS query) blocked: .+:(\d+) \(([^)]+)\)/,
    extract: (match) => ({ target: match[2], port: parseInt(match[1]) }),
  },
  // Connection blocked without hostname (IP only)
  // IPv4: 1.2.3.4:443
  {
    pattern: /\[egress-filter\] Connection blocked: ((?:\d{1,3}\.){3}\d{1,3}):(\d+)$/,
    extract: (match) => ({ target: match[1], port: parseInt(match[2]), isIp: true }),
  },
  // DoH query (hostname only)
  {
    pattern: /\[egress-filter\] DoH query blocked: (.+)$/,
    extract: (match) => ({ target: match[1].trim(), port: 443 }),
  },
];

function parseBlockedTargets(logContent) {
  // Use Map to deduplicate: "target:port" -> { domain/ip, port, count }
  const blocks = new Map();

  for (const line of logContent.split("\n")) {
    for (const { pattern, extract } of BLOCKED_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const extracted = extract(match);
        const { target, port } = extracted;
        // Determine if target is IP or domain
        const isIp = extracted.isIp || isIpAddress(target);

        const key = `${target}:${port}`;
        if (blocks.has(key)) {
          blocks.get(key).count++;
        } else {
          const entry = { port, count: 1 };
          if (isIp) {
            entry.ip = target;
          } else {
            entry.domain = target;
          }
          blocks.set(key, entry);
        }
        break;
      }
    }
  }

  return Array.from(blocks.values());
}

function main() {
  const args = process.argv.slice(2);
  const clearLog = args.includes("--clear");
  const jsonOutput = args.includes("--json");

  // Check if log file exists
  if (!fs.existsSync(LOG_FILE)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ blocks: [], message: "No blocked connections detected." }));
    } else {
      console.log("No blocked connections detected.");
    }
    return;
  }

  // Read log file
  let logContent;
  try {
    logContent = fs.readFileSync(LOG_FILE, "utf-8");
  } catch (err) {
    console.error(`Error reading log file: ${err.message}`);
    process.exit(1);
  }

  // Parse blocked targets (domains and IPs)
  const blocks = parseBlockedTargets(logContent);

  // Output results
  if (jsonOutput) {
    console.log(
      JSON.stringify({
        blocks: blocks.map((b) => {
          const entry = { port: b.port, count: b.count };
          if (b.ip) {
            entry.ip = b.ip;
          } else {
            entry.domain = b.domain;
          }
          return entry;
        }),
        message:
          blocks.length > 0
            ? `${blocks.length} target(s) were blocked. Request allowlist access for these targets.`
            : "No blocked connections detected.",
      })
    );
  } else {
    if (blocks.length === 0) {
      console.log("No blocked connections detected.");
    } else {
      console.log("Blocked targets detected:\n");
      for (const block of blocks) {
        const target = block.domain || block.ip;
        const countStr = block.count > 1 ? ` (${block.count} attempts)` : "";
        console.log(`  - ${target}:${block.port}${countStr}`);
      }
      console.log("\nTo request access, use:");
      console.log("  node request-access.js <domain> --port <port>");
      console.log("  node request-access.js <ip> --ip --port <port>");
    }
  }

  // Clear log if requested
  if (clearLog) {
    try {
      fs.writeFileSync(LOG_FILE, "");
      if (!jsonOutput) {
        console.log("\nLog file cleared.");
      }
    } catch (err) {
      console.error(`Error clearing log file: ${err.message}`);
    }
  }
}

main();
