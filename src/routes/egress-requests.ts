/**
 * Egress Requests API endpoints
 *
 * Provides CRUD operations for egress filter access requests.
 * All endpoints require Cloudflare Access authentication.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { ensureMoltbotGateway } from '../gateway/process';
import { mountR2Storage } from '../gateway/r2';
import { syncToR2 } from '../gateway/sync';
import { waitForProcess } from '../gateway/utils';

const SKILLS_PATH = '/root/clawd/skills/egress-request/scripts';
const ADMIN_SCRIPTS_PATH = '/root/admin-scripts';
const CLI_TIMEOUT_MS = 20_000;
const SYNC_TIMEOUT_MS = 30_000;

export const egressRequestsApi = new Hono<AppEnv>();

/**
 * GET /egress-requests
 * List all pending egress access requests
 */
egressRequestsApi.get('/', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    await ensureMoltbotGateway(sandbox, c.env);

    const proc = await sandbox.startProcess(`node ${SKILLS_PATH}/list-requests.js --json --all`);
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';

    try {
      const data = JSON.parse(stdout);
      return c.json(data);
    } catch {
      return c.json({
        pending: [],
        approved: [],
        denied: [],
        error: 'Failed to parse response',
        raw: stdout,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * GET /egress-requests/blocked
 * Get recently blocked connections from egress filter log
 */
egressRequestsApi.get('/blocked', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    await ensureMoltbotGateway(sandbox, c.env);

    const proc = await sandbox.startProcess(`node ${SKILLS_PATH}/check-blocks.js --json`);
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';

    try {
      const data = JSON.parse(stdout);
      return c.json(data);
    } catch {
      return c.json({
        blocks: [],
        error: 'Failed to parse response',
        raw: stdout,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

// IPv4: 192.168.1.1 or 192.168.1.0/24
const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
// IPv6: ::1 or 2001:db8::1 or 2001:db8::/32
const IPV6_PATTERN = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\/\d{1,3})?$/;
// Domain: example.com or *.example.com
const DOMAIN_PATTERN = /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

function isValidIp(ip: string): boolean {
  // Check basic pattern first
  if (!IPV4_PATTERN.test(ip) && !IPV6_PATTERN.test(ip)) {
    return false;
  }
  // For IPv4, validate each octet
  if (IPV4_PATTERN.test(ip)) {
    const [addr, prefix] = ip.split('/');
    const octets = addr.split('.').map(Number);
    if (octets.some((o) => o < 0 || o > 255)) return false;
    if (prefix !== undefined) {
      const prefixNum = Number(prefix);
      if (prefixNum < 0 || prefixNum > 32) return false;
    }
  }
  return true;
}

/**
 * POST /egress-requests
 * Create a new access request
 */
egressRequestsApi.post('/', async (c) => {
  const sandbox = c.get('sandbox');

  let body: { domain?: string; ip?: string; port?: number; reason?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { domain, ip, port = 443, reason } = body;

  // Either domain or ip is required, but not both
  if (!domain && !ip) {
    return c.json({ error: 'domain or ip is required' }, 400);
  }
  if (domain && ip) {
    return c.json({ error: 'Specify either domain or ip, not both' }, 400);
  }

  // Validate domain format
  if (domain && !DOMAIN_PATTERN.test(domain)) {
    return c.json({ error: 'Invalid domain format' }, 400);
  }

  // Validate IP format
  if (ip && !isValidIp(ip)) {
    return c.json({ error: 'Invalid IP address format' }, 400);
  }

  try {
    // Only mount R2, don't wait for gateway (create request is file-only operation)
    await mountR2Storage(sandbox, c.env);

    const target = domain || ip;
    let cmd = `node ${SKILLS_PATH}/request-access.js "${target}" --port ${port}`;
    if (ip) {
      cmd += ' --ip';
    }
    if (reason) {
      // Escape reason for shell
      const escapedReason = reason.replace(/"/g, '\\"');
      cmd += ` --reason "${escapedReason}"`;
    }

    const proc = await sandbox.startProcess(cmd);
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const success = stdout.includes('created successfully') || stdout.includes('already pending');

    return c.json({
      success,
      domain: domain || undefined,
      ip: ip || undefined,
      port,
      message: success ? 'Request created' : 'Failed to create request',
      output: stdout,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * POST /egress-requests/:id/approve
 * Approve a pending request (adds to allowlist)
 */
egressRequestsApi.post('/:id/approve', async (c) => {
  const sandbox = c.get('sandbox');
  const id = c.req.param('id');

  if (!id) {
    return c.json({ error: 'Request ID is required' }, 400);
  }

  try {
    // Only mount R2, don't wait for gateway (approve is file-only operation)
    await mountR2Storage(sandbox, c.env);

    const proc = await sandbox.startProcess(
      `node ${ADMIN_SCRIPTS_PATH}/approve-request.js "${id}"`
    );
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';
    const success = stdout.includes('approved') || stdout.includes('Added');

    // Sync to R2 in background after successful approval
    if (success) {
      c.executionCtx.waitUntil(
        syncToR2(sandbox, c.env).catch((err) => {
          console.error('R2 sync after approval failed:', err);
        })
      );
    }

    return c.json({
      success,
      id,
      message: success ? 'Request approved and added to allowlist' : 'Approval failed',
      output: stdout,
      error: success ? undefined : stderr || stdout,
      needsRestart: success,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * POST /egress-requests/:id/deny
 * Deny a pending request
 */
egressRequestsApi.post('/:id/deny', async (c) => {
  const sandbox = c.get('sandbox');
  const id = c.req.param('id');

  let body: { reason?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // Body is optional
  }

  if (!id) {
    return c.json({ error: 'Request ID is required' }, 400);
  }

  try {
    // Only mount R2, don't wait for gateway (deny is file-only operation)
    await mountR2Storage(sandbox, c.env);

    let cmd = `node ${ADMIN_SCRIPTS_PATH}/approve-request.js "${id}" --deny`;
    if (body.reason) {
      const escapedReason = body.reason.replace(/"/g, '\\"');
      cmd += ` --reason "${escapedReason}"`;
    }

    const proc = await sandbox.startProcess(cmd);
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const success = stdout.includes('denied') || stdout.includes('archived');

    return c.json({
      success,
      id,
      message: success ? 'Request denied' : 'Denial failed',
      output: stdout,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * POST /egress-requests/approve-all
 * Approve all pending requests
 */
egressRequestsApi.post('/approve-all', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Only mount R2, don't wait for gateway (approve-all is file-only operation)
    await mountR2Storage(sandbox, c.env);

    const proc = await sandbox.startProcess(
      `node ${ADMIN_SCRIPTS_PATH}/approve-request.js --all`
    );
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const success = stdout.includes('approved') || stdout.includes('Done');

    // Parse counts from output
    const approvedMatch = stdout.match(/(\d+) approved/);
    const failedMatch = stdout.match(/(\d+) failed/);
    const approvedCount = approvedMatch ? parseInt(approvedMatch[1], 10) : 0;

    // Sync to R2 in background after successful approval
    if (success && approvedCount > 0) {
      c.executionCtx.waitUntil(
        syncToR2(sandbox, c.env).catch((err) => {
          console.error('R2 sync after bulk approval failed:', err);
        })
      );
    }

    return c.json({
      success,
      approved: approvedCount,
      failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
      message: success ? 'All requests processed' : 'Processing failed',
      output: stdout,
      needsRestart: success,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * POST /egress-requests/clear-log
 * Clear the egress filter blocked log
 */
egressRequestsApi.post('/clear-log', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    // Only mount R2, don't wait for gateway (clear-log is file-only operation)
    await mountR2Storage(sandbox, c.env);

    const proc = await sandbox.startProcess(
      `node ${SKILLS_PATH}/check-blocks.js --clear`
    );
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    return c.json({
      success: true,
      message: 'Log cleared',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

const ALLOWLIST_PATH = '/etc/egress-filter/allowlist.yaml';

/**
 * GET /egress-requests/allowlist
 * Get the raw allowlist YAML content
 */
egressRequestsApi.get('/allowlist', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    await mountR2Storage(sandbox, c.env);

    const proc = await sandbox.startProcess(`cat ${ALLOWLIST_PATH}`);
    await waitForProcess(proc, CLI_TIMEOUT_MS);

    const logs = await proc.getLogs();
    const content = logs.stdout || '';

    return c.json({
      success: true,
      content,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * PUT /egress-requests/allowlist
 * Update the allowlist YAML content
 */
egressRequestsApi.put('/allowlist', async (c) => {
  const sandbox = c.get('sandbox');

  let body: { content: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { content } = body;
  if (typeof content !== 'string') {
    return c.json({ error: 'content is required and must be a string' }, 400);
  }

  try {
    await mountR2Storage(sandbox, c.env);

    // Write content using heredoc (single-quoted delimiter prevents shell expansion)
    const tempPath = '/tmp/allowlist-new.yaml';
    const writeCmd = `cat > ${tempPath} << 'EOFALLOWLIST'
${content}
EOFALLOWLIST`;

    const writeProc = await sandbox.startProcess(writeCmd);
    await waitForProcess(writeProc, CLI_TIMEOUT_MS);

    // Move temp file to final location (atomic write)
    const moveProc = await sandbox.startProcess(`mv ${tempPath} ${ALLOWLIST_PATH}`);
    await waitForProcess(moveProc, CLI_TIMEOUT_MS);

    // Sync to R2 in background
    c.executionCtx.waitUntil(
      syncToR2(sandbox, c.env).catch((err) => {
        console.error('R2 sync after allowlist update failed:', err);
      })
    );

    return c.json({
      success: true,
      message: 'Allowlist updated. Restart the gateway to apply changes.',
      needsRestart: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: errorMessage }, 500);
  }
});
