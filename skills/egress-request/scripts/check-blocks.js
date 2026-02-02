#!/usr/bin/env node
/**
 * Check egress filter blocked connections and report hosts that need allowlist access.
 *
 * Usage:
 *   node check-blocks.js [--clear] [--json]
 *
 * Options:
 *   --clear  Clear the log after reading
 *   --json   Output in JSON format
 */

const fs = require("fs");
const path = require("path");

const LOG_FILE = "/var/log/egress-filter.log";

// Pattern to match egress-filter blocked messages
// Examples:
//   [egress-filter] Connection blocked: 1.2.3.4:443 (example.com)
//   [egress-filter] Connection blocked: 1.2.3.4:443
//   [egress-filter] DNS query blocked: 1.2.3.4:53 (example.com)
//   [egress-filter] DoH query blocked: example.com
const BLOCKED_PATTERNS = [
  // Connection/DNS query with hostname in parentheses
  /\[egress-filter\] (?:Connection|DNS query) blocked: [\d.]+:(\d+) \(([^)]+)\)/,
  // Connection/DNS query without hostname (IP only)
  /\[egress-filter\] (?:Connection|DNS query) blocked: ([\d.]+):(\d+)$/,
  // DoH query (hostname only)
  /\[egress-filter\] DoH query blocked: (.+)$/,
];

function parseBlockedHosts(logContent) {
  const blocks = new Map(); // Use Map to deduplicate: "host:port" -> { host, port, count }

  for (const line of logContent.split("\n")) {
    for (const pattern of BLOCKED_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        let host, port;

        if (pattern.source.includes("DoH query")) {
          // DoH pattern: group 1 is hostname
          host = match[1];
          port = 443; // DoH is always HTTPS
        } else if (match[2] && isNaN(parseInt(match[2]))) {
          // Pattern with hostname in parentheses: group 1 is port, group 2 is hostname
          port = parseInt(match[1]);
          host = match[2];
        } else if (match[2]) {
          // IP-only pattern: group 1 is IP, group 2 is port
          host = match[1];
          port = parseInt(match[2]);
        } else {
          continue;
        }

        const key = `${host}:${port}`;
        if (blocks.has(key)) {
          blocks.get(key).count++;
        } else {
          blocks.set(key, { host, port, count: 1 });
        }
        break; // Stop checking patterns once matched
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

  // Parse blocked hosts
  const blocks = parseBlockedHosts(logContent);

  // Output results
  if (jsonOutput) {
    console.log(
      JSON.stringify({
        blocks: blocks.map((b) => ({
          host: b.host,
          port: b.port,
          count: b.count,
        })),
        message:
          blocks.length > 0
            ? `${blocks.length} unique host(s) were blocked. Request allowlist access for these hosts.`
            : "No blocked connections detected.",
      })
    );
  } else {
    if (blocks.length === 0) {
      console.log("No blocked connections detected.");
    } else {
      console.log("Blocked connections detected:\n");
      for (const block of blocks) {
        const countStr = block.count > 1 ? ` (${block.count} attempts)` : "";
        console.log(`  - ${block.host}:${block.port}${countStr}`);
      }
      console.log("\nTo request access, please contact the administrator with the host names above.");
      console.log("These hosts need to be added to the egress filter allowlist.");
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
