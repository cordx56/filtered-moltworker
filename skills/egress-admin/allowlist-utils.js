#!/usr/bin/env node
/**
 * Utility functions for managing egress allowlist.
 * Used by admin scripts within the egress-request skill.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = "/etc/egress-filter/allowlist.yaml";

// R2 mount path for persistent storage (must match src/config.ts)
const R2_MOUNT_PATH = "/data/moltbot";
const R2_ALLOWLIST_DIR = path.join(R2_MOUNT_PATH, "egress-filter");
const R2_ALLOWLIST_PATH = path.join(R2_ALLOWLIST_DIR, "allowlist.yaml");

/**
 * Add a domain pattern to the allowlist.
 * @param {string} configPath - Path to allowlist.yaml
 * @param {string} domain - Domain pattern (e.g., "api.example.com" or "*.example.com")
 * @param {number|number[]} port - Port number(s)
 * @param {string} [reason] - Optional reason for the entry
 * @param {string} [comment] - Optional comment line (e.g., "Added via egress-request approval")
 * @returns {boolean} Success status
 */
function addDomainToAllowlist(configPath, domain, port, reason, comment) {
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Config file not found: ${configPath}`);
    return false;
  }

  let content = fs.readFileSync(configPath, "utf-8");

  // Check if domain is already in allowlist
  if (
    content.includes(`pattern: "${domain}"`) ||
    content.includes(`pattern: '${domain}'`)
  ) {
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
  const ports = Array.isArray(port) ? port : [port];
  let newRule = "\n";
  if (comment) {
    newRule += `${indent}# ${comment}\n`;
  }
  newRule += `${indent}- pattern: "${domain}"\n`;
  newRule += `${indent}  ports: [${ports.join(", ")}]\n`;
  if (reason) {
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

/**
 * Add an IP/CIDR to the allowlist.
 * @param {string} configPath - Path to allowlist.yaml
 * @param {string} ip - IP address or CIDR (e.g., "192.168.1.1" or "10.0.0.0/8")
 * @param {number|number[]} [port] - Optional port number(s)
 * @param {string} [reason] - Optional reason for the entry
 * @param {string} [comment] - Optional comment line
 * @returns {boolean} Success status
 */
function addIpToAllowlist(configPath, ip, port, reason, comment) {
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Config file not found: ${configPath}`);
    return false;
  }

  let content = fs.readFileSync(configPath, "utf-8");

  // Normalize CIDR for single IPv4 addresses
  const cidr = ip.includes("/") || ip.includes(":") ? ip : `${ip}/32`;

  // Check if IP is already in allowlist
  if (
    content.includes(`cidr: "${ip}"`) ||
    content.includes(`cidr: '${ip}'`) ||
    content.includes(`cidr: "${cidr}"`) ||
    content.includes(`cidr: '${cidr}'`)
  ) {
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
  let newRule = "\n";
  if (comment) {
    newRule += `${indent}# ${comment}\n`;
  }
  newRule += `${indent}- cidr: "${cidr}"\n`;
  if (port) {
    const ports = Array.isArray(port) ? port : [port];
    newRule += `${indent}  ports: [${ports.join(", ")}]\n`;
  }
  if (reason) {
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

/**
 * Validate domain format.
 * @param {string} domain - Domain to validate
 * @returns {boolean} Whether the domain is valid
 */
function isValidDomain(domain) {
  const pattern =
    /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
  return pattern.test(domain);
}

/**
 * Validate IP/CIDR format.
 * @param {string} ip - IP address or CIDR to validate
 * @returns {boolean} Whether the IP is valid
 */
function isValidIp(ip) {
  // IPv4 with optional CIDR
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

/**
 * Validate port number(s).
 * @param {number|number[]} port - Port number(s) to validate
 * @returns {boolean} Whether all ports are valid
 */
function isValidPort(port) {
  const ports = Array.isArray(port) ? port : [port];
  return ports.every((p) => !isNaN(p) && p >= 1 && p <= 65535);
}

/**
 * allowlistファイルをR2マウントパスにバックアップする。
 * R2がマウントされていない場合は何もしない（cronで同期される）。
 * @param {string} configPath - バックアップ元のallowlist.yamlパス
 */
function syncAllowlistToR2(configPath) {
  try {
    if (!fs.existsSync(R2_MOUNT_PATH)) return;
    fs.mkdirSync(R2_ALLOWLIST_DIR, { recursive: true });
    fs.copyFileSync(configPath, R2_ALLOWLIST_PATH);
  } catch {
    // R2未マウント時は無視（cronで同期される）
  }
}

module.exports = {
  DEFAULT_CONFIG,
  addDomainToAllowlist,
  addIpToAllowlist,
  syncAllowlistToR2,
  isValidDomain,
  isValidIp,
  isValidPort,
};
