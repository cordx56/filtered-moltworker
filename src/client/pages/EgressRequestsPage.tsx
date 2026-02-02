import { useState, useEffect, useCallback } from 'react';
import './EgressRequestsPage.css';
import {
  listEgressRequests,
  getBlockedConnections,
  approveEgressRequest,
  denyEgressRequest,
  approveAllEgressRequests,
  clearBlockedLog,
  createEgressRequest,
  getAllowlist,
  updateAllowlist,
  type EgressRequest,
  type BlockedConnection,
} from '../api';

function ButtonSpinner() {
  return <span className="button-spinner" />;
}

export function EgressRequestsPage() {
  const [pending, setPending] = useState<EgressRequest[]>([]);
  const [approved, setApproved] = useState<EgressRequest[]>([]);
  const [denied, setDenied] = useState<EgressRequest[]>([]);
  const [blocked, setBlocked] = useState<BlockedConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [showAllowlistEditor, setShowAllowlistEditor] = useState(false);
  const [allowlistContent, setAllowlistContent] = useState('');
  const [allowlistOriginal, setAllowlistOriginal] = useState('');
  const [allowlistLoading, setAllowlistLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [requestsData, blockedData] = await Promise.all([
        listEgressRequests(),
        getBlockedConnections(),
      ]);
      setPending(requestsData.pending || []);
      setApproved(requestsData.approved || []);
      setDenied(requestsData.denied || []);
      setBlocked(blockedData.blocks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async (id: string) => {
    setActionInProgress(`approve-${id}`);
    try {
      const result = await approveEgressRequest(id);
      if (result.success) {
        setNeedsRestart(true);
        await fetchData();
      } else {
        setError(result.error || 'Approval failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeny = async (id: string) => {
    setActionInProgress(`deny-${id}`);
    try {
      const result = await denyEgressRequest(id);
      if (result.success) {
        await fetchData();
      } else {
        setError(result.error || 'Denial failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny request');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApproveAll = async () => {
    if (pending.length === 0) return;
    setActionInProgress('approve-all');
    try {
      const result = await approveAllEgressRequests();
      if (result.success) {
        setNeedsRestart(true);
        await fetchData();
      } else {
        setError(result.error || 'Bulk approval failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve all requests');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCreateRequest = async (
    target: { domain: string } | { ip: string },
    port: number
  ) => {
    const targetKey = 'domain' in target ? target.domain : target.ip;
    setActionInProgress(`create-${targetKey}`);
    try {
      const result = await createEgressRequest(target, port);
      if (result.success) {
        await fetchData();
      } else {
        setError(result.error || 'Failed to create request');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleClearLog = async () => {
    setActionInProgress('clear-log');
    try {
      await clearBlockedLog();
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear log');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleLoadAllowlist = async () => {
    setAllowlistLoading(true);
    try {
      const result = await getAllowlist();
      if (result.success && result.content !== undefined) {
        setAllowlistContent(result.content);
        setAllowlistOriginal(result.content);
        setShowAllowlistEditor(true);
      } else {
        setError(result.error || 'Failed to load allowlist');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load allowlist');
    } finally {
      setAllowlistLoading(false);
    }
  };

  const handleSaveAllowlist = async () => {
    setActionInProgress('save-allowlist');
    try {
      const result = await updateAllowlist(allowlistContent);
      if (result.success) {
        setAllowlistOriginal(allowlistContent);
        setNeedsRestart(true);
      } else {
        setError(result.error || 'Failed to save allowlist');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save allowlist');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCloseAllowlistEditor = () => {
    if (allowlistContent !== allowlistOriginal) {
      if (!confirm('You have unsaved changes. Discard them?')) {
        return;
      }
    }
    setShowAllowlistEditor(false);
    setAllowlistContent('');
    setAllowlistOriginal('');
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="egress-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading egress requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="egress-page">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {needsRestart && (
        <div className="warning-banner">
          <span>Changes approved. Restart the gateway to apply the new allowlist.</span>
          <button onClick={() => setNeedsRestart(false)}>&times;</button>
        </div>
      )}

      {/* Blocked Connections Section */}
      <section className="egress-section">
        <div className="section-header">
          <h2>Blocked Connections</h2>
          <div className="section-actions">
            <button
              className="btn btn-secondary"
              onClick={handleClearLog}
              disabled={actionInProgress !== null || blocked.length === 0}
            >
              {actionInProgress === 'clear-log' && <ButtonSpinner />}
              Clear Log
            </button>
            <button
              className="btn btn-secondary"
              onClick={fetchData}
              disabled={actionInProgress !== null}
            >
              Refresh
            </button>
          </div>
        </div>

        {blocked.length === 0 ? (
          <p className="empty-message">No blocked connections detected.</p>
        ) : (
          <div className="blocked-grid">
            {blocked.map((block, idx) => {
              const target = block.domain || block.ip || 'unknown';
              const targetParam = block.domain
                ? { domain: block.domain }
                : { ip: block.ip! };
              return (
                <div key={`${target}-${block.port}-${idx}`} className="blocked-card">
                  <div className="blocked-info">
                    <span className="blocked-domain">{target}</span>
                    <span className="blocked-port">:{block.port}</span>
                    {block.count > 1 && (
                      <span className="blocked-count">({block.count} attempts)</span>
                    )}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleCreateRequest(targetParam, block.port)}
                    disabled={actionInProgress !== null}
                  >
                    {actionInProgress === `create-${target}` && <ButtonSpinner />}
                    Request Access
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Pending Requests Section */}
      <section className="egress-section">
        <div className="section-header">
          <h2>Pending Requests</h2>
          {pending.length > 0 && (
            <div className="section-actions">
              <button
                className="btn btn-success"
                onClick={handleApproveAll}
                disabled={actionInProgress !== null}
              >
                {actionInProgress === 'approve-all' && <ButtonSpinner />}
                Approve All ({pending.length})
              </button>
            </div>
          )}
        </div>

        {pending.length === 0 ? (
          <p className="empty-message">No pending requests.</p>
        ) : (
          <div className="requests-grid">
            {pending.map((req) => (
              <div key={req.id} className="request-card pending">
                <div className="request-header">
                  <span className="request-domain">{req.domain || req.ip}:{req.port}</span>
                  <span className="request-badge pending">Pending</span>
                </div>
                <div className="request-details">
                  {req.reason && (
                    <div className="detail-row">
                      <span className="label">Reason:</span>
                      <span className="value">{req.reason}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="label">Requested:</span>
                    <span className="value">{formatDate(req.requested_at)}</span>
                  </div>
                </div>
                <div className="request-actions">
                  <button
                    className="btn btn-success"
                    onClick={() => handleApprove(req.id)}
                    disabled={actionInProgress !== null}
                  >
                    {actionInProgress === `approve-${req.id}` && <ButtonSpinner />}
                    Approve
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDeny(req.id)}
                    disabled={actionInProgress !== null}
                  >
                    {actionInProgress === `deny-${req.id}` && <ButtonSpinner />}
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History Section */}
      <section className="egress-section">
        <div className="section-header">
          <h2>History</h2>
          <button
            className="btn btn-secondary"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? 'Hide' : 'Show'} ({approved.length + denied.length})
          </button>
        </div>

        {showHistory && (
          <div className="history-container">
            {approved.length > 0 && (
              <>
                <h3>Approved</h3>
                <div className="requests-grid">
                  {approved.map((req) => (
                    <div key={req.id} className="request-card approved">
                      <div className="request-header">
                        <span className="request-domain">{req.domain || req.ip}:{req.port}</span>
                        <span className="request-badge approved">Approved</span>
                      </div>
                      <div className="request-details">
                        {req.reason && (
                          <div className="detail-row">
                            <span className="label">Reason:</span>
                            <span className="value">{req.reason}</span>
                          </div>
                        )}
                        <div className="detail-row">
                          <span className="label">Approved:</span>
                          <span className="value">
                            {formatDate(req.approved_at || req.requested_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {denied.length > 0 && (
              <>
                <h3>Denied</h3>
                <div className="requests-grid">
                  {denied.map((req) => (
                    <div key={req.id} className="request-card denied">
                      <div className="request-header">
                        <span className="request-domain">{req.domain || req.ip}:{req.port}</span>
                        <span className="request-badge denied">Denied</span>
                      </div>
                      <div className="request-details">
                        {req.deny_reason && (
                          <div className="detail-row">
                            <span className="label">Deny reason:</span>
                            <span className="value">{req.deny_reason}</span>
                          </div>
                        )}
                        <div className="detail-row">
                          <span className="label">Denied:</span>
                          <span className="value">
                            {formatDate(req.denied_at || req.requested_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {approved.length === 0 && denied.length === 0 && (
              <p className="empty-message">No history yet.</p>
            )}
          </div>
        )}
      </section>

      {/* Allowlist Editor Section */}
      <section className="egress-section">
        <div className="section-header">
          <h2>Allowlist Editor</h2>
          {!showAllowlistEditor ? (
            <button
              className="btn btn-secondary"
              onClick={handleLoadAllowlist}
              disabled={allowlistLoading || actionInProgress !== null}
            >
              {allowlistLoading && <ButtonSpinner />}
              Edit Allowlist
            </button>
          ) : (
            <div className="section-actions">
              <button
                className="btn btn-success"
                onClick={handleSaveAllowlist}
                disabled={actionInProgress !== null || allowlistContent === allowlistOriginal}
              >
                {actionInProgress === 'save-allowlist' && <ButtonSpinner />}
                Save
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleCloseAllowlistEditor}
                disabled={actionInProgress !== null}
              >
                Close
              </button>
            </div>
          )}
        </div>

        {showAllowlistEditor ? (
          <div className="allowlist-editor">
            <textarea
              className="allowlist-textarea"
              value={allowlistContent}
              onChange={(e) => setAllowlistContent(e.target.value)}
              spellCheck={false}
              placeholder="Loading..."
            />
            {allowlistContent !== allowlistOriginal && (
              <p className="unsaved-warning">You have unsaved changes</p>
            )}
          </div>
        ) : (
          <p className="empty-message">
            Click "Edit Allowlist" to view and edit the raw allowlist.yaml file.
          </p>
        )}
      </section>
    </div>
  );
}
