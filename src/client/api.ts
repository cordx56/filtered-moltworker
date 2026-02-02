// API client for admin endpoints
// Authentication is handled by Cloudflare Access (JWT in cookies)

const API_BASE = '/api/admin';

export interface PendingDevice {
  requestId: string;
  deviceId: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  ts: number;
}

export interface PairedDevice {
  deviceId: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  createdAtMs: number;
  approvedAtMs: number;
}

export interface DeviceListResponse {
  pending: PendingDevice[];
  paired: PairedDevice[];
  raw?: string;
  stderr?: string;
  parseError?: string;
  error?: string;
}

export interface ApproveResponse {
  success: boolean;
  requestId: string;
  message?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface ApproveAllResponse {
  approved: string[];
  failed: Array<{ requestId: string; success: boolean; error?: string }>;
  message?: string;
  error?: string;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

async function apiRequest<T>(
  path: string,
  options: globalThis.RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  } as globalThis.RequestInit);

  if (response.status === 401) {
    throw new AuthError('Unauthorized - please log in via Cloudflare Access');
  }

  const data = await response.json() as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

export async function listDevices(): Promise<DeviceListResponse> {
  return apiRequest<DeviceListResponse>('/devices');
}

export async function approveDevice(requestId: string): Promise<ApproveResponse> {
  return apiRequest<ApproveResponse>(`/devices/${requestId}/approve`, {
    method: 'POST',
  });
}

export async function approveAllDevices(): Promise<ApproveAllResponse> {
  return apiRequest<ApproveAllResponse>('/devices/approve-all', {
    method: 'POST',
  });
}

export interface RestartGatewayResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export async function restartGateway(): Promise<RestartGatewayResponse> {
  return apiRequest<RestartGatewayResponse>('/gateway/restart', {
    method: 'POST',
  });
}

export interface StorageStatusResponse {
  configured: boolean;
  missing?: string[];
  lastSync: string | null;
  message: string;
}

export async function getStorageStatus(): Promise<StorageStatusResponse> {
  return apiRequest<StorageStatusResponse>('/storage');
}

export interface SyncResponse {
  success: boolean;
  message?: string;
  lastSync?: string;
  error?: string;
  details?: string;
}

export async function triggerSync(): Promise<SyncResponse> {
  return apiRequest<SyncResponse>('/storage/sync', {
    method: 'POST',
  });
}

// ============================================================
// Egress Requests API
// ============================================================

export interface EgressRequest {
  id: string;
  domain?: string;
  ip?: string;
  port: number;
  reason?: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'denied';
  approved_at?: string;
  denied_at?: string;
  deny_reason?: string;
}

export interface BlockedConnection {
  domain?: string;
  ip?: string;
  port: number;
  count: number;
}

export interface EgressRequestsListResponse {
  pending: EgressRequest[];
  approved: EgressRequest[];
  denied: EgressRequest[];
  error?: string;
}

export interface BlockedConnectionsResponse {
  blocks: BlockedConnection[];
  message?: string;
  error?: string;
}

export interface EgressActionResponse {
  success: boolean;
  id?: string;
  host?: string;
  port?: number;
  message?: string;
  output?: string;
  error?: string;
  needsRestart?: boolean;
}

export interface EgressApproveAllResponse {
  success: boolean;
  approved: number;
  failed: number;
  message?: string;
  error?: string;
  needsRestart?: boolean;
}

export async function listEgressRequests(): Promise<EgressRequestsListResponse> {
  return apiRequest<EgressRequestsListResponse>('/egress-requests');
}

export async function getBlockedConnections(): Promise<BlockedConnectionsResponse> {
  return apiRequest<BlockedConnectionsResponse>('/egress-requests/blocked');
}

export async function createEgressRequest(
  target: { domain: string } | { ip: string },
  port: number = 443,
  reason?: string
): Promise<EgressActionResponse> {
  return apiRequest<EgressActionResponse>('/egress-requests', {
    method: 'POST',
    body: JSON.stringify({ ...target, port, reason }),
  });
}

export async function approveEgressRequest(id: string): Promise<EgressActionResponse> {
  return apiRequest<EgressActionResponse>(`/egress-requests/${id}/approve`, {
    method: 'POST',
  });
}

export async function denyEgressRequest(
  id: string,
  reason?: string
): Promise<EgressActionResponse> {
  return apiRequest<EgressActionResponse>(`/egress-requests/${id}/deny`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function approveAllEgressRequests(): Promise<EgressApproveAllResponse> {
  return apiRequest<EgressApproveAllResponse>('/egress-requests/approve-all', {
    method: 'POST',
  });
}

export interface EgressDenyAllResponse {
  success: boolean;
  denied: number;
  failed: number;
  message?: string;
  error?: string;
}

export async function denyAllEgressRequests(): Promise<EgressDenyAllResponse> {
  return apiRequest<EgressDenyAllResponse>('/egress-requests/deny-all', {
    method: 'POST',
  });
}

export async function clearBlockedLog(): Promise<{ success: boolean; message?: string }> {
  return apiRequest<{ success: boolean; message?: string }>('/egress-requests/clear-log', {
    method: 'POST',
  });
}

export interface AllowlistResponse {
  success: boolean;
  content?: string;
  message?: string;
  error?: string;
  needsRestart?: boolean;
}

export async function getAllowlist(): Promise<AllowlistResponse> {
  return apiRequest<AllowlistResponse>('/egress-requests/allowlist');
}

export async function updateAllowlist(content: string): Promise<AllowlistResponse> {
  return apiRequest<AllowlistResponse>('/egress-requests/allowlist', {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}
