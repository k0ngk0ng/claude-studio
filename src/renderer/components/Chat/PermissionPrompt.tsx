import React from 'react';
import type { PermissionRequest } from '../../stores/permissionStore';
import { usePermissionStore } from '../../stores/permissionStore';

interface PermissionPromptProps {
  request: PermissionRequest;
}

export function PermissionPrompt({ request }: PermissionPromptProps) {
  const { approveRequest, denyRequest } = usePermissionStore();
  const isPending = request.status === 'pending';
  const isApproved = request.status === 'approved';
  const isDenied = request.status === 'denied';

  return (
    <div className={`rounded-lg border overflow-hidden ${
      isPending
        ? 'border-yellow-500/40 bg-yellow-500/5'
        : isApproved
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-border bg-surface'
    }`}>
      <div className="px-3 py-2.5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          {/* Shield icon */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={
            isPending ? 'text-yellow-400' : isApproved ? 'text-green-400' : 'text-text-muted'
          }>
            <path
              d="M8 1.5L2.5 4v4c0 3.5 2.3 5.8 5.5 6.5 3.2-.7 5.5-3 5.5-6.5V4L8 1.5z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {isApproved && (
              <path d="M5.5 8.5l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {isDenied && (
              <>
                <path d="M6 6l4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M10 6l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </>
            )}
          </svg>

          <span className="text-[13px] font-medium text-text-primary">
            {isPending
              ? 'Permission Required'
              : isApproved
                ? 'Permission Granted'
                : 'Permission Denied'}
          </span>
        </div>

        {/* Command info */}
        <div className="text-xs text-text-secondary mb-2">
          <span className="font-medium text-text-primary">{request.toolName}</span>
          {' wants to run: '}
        </div>
        <pre className="text-xs font-mono text-text-secondary bg-bg rounded px-2 py-1.5 mb-2 whitespace-pre-wrap break-all max-h-[100px] overflow-y-auto">
          {request.command}
        </pre>

        {/* Pattern info */}
        {isPending && (
          <div className="text-[11px] text-text-muted mb-2.5">
            Approving will allow <code className="px-1 py-0.5 bg-surface rounded text-accent text-[10px]">{request.toolPattern}</code> for this and future sessions.
          </div>
        )}

        {isApproved && (
          <div className="text-[11px] text-green-400/80 mb-1">
            ✓ Allowed <code className="px-1 py-0.5 bg-surface rounded text-[10px]">{request.toolPattern}</code> — retrying with updated permissions…
          </div>
        )}

        {isDenied && (
          <div className="text-[11px] text-text-muted mb-1">
            Command was denied.
          </div>
        )}

        {/* Action buttons */}
        {isPending && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => approveRequest(request.id)}
              className="px-3 py-1 rounded-md text-xs font-medium
                bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
            >
              Allow
            </button>
            <button
              onClick={() => denyRequest(request.id)}
              className="px-3 py-1 rounded-md text-xs font-medium
                bg-surface text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Deny
            </button>
            <button
              onClick={() => {
                // Approve all pending requests
                const { pendingRequests, approveRequest: approve } = usePermissionStore.getState();
                pendingRequests
                  .filter(r => r.status === 'pending')
                  .forEach(r => approve(r.id));
              }}
              className="px-3 py-1 rounded-md text-xs font-medium
                text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors ml-auto"
            >
              Allow All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
