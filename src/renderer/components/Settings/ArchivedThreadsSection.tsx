import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ArchivedSessionInfo } from '../../types';

export function ArchivedThreadsSection() {
  const { t } = useTranslation();
  const [archivedSessions, setArchivedSessions] = useState<ArchivedSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    window.api.sessions.listArchived()
      .then(setArchivedSessions)
      .finally(() => setIsLoading(false));
  }, []);

  const handleUnarchive = async (session: ArchivedSessionInfo) => {
    const success = await window.api.sessions.unarchive(session.id);
    if (success) {
      setArchivedSessions(prev => prev.filter(s => s.id !== session.id));
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">{t('archivedThreads.title')}</h2>
      <p className="text-sm text-text-muted mb-6">
        {t('archivedThreads.description')}
      </p>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-sm text-text-muted">{t('archivedThreads.loading')}</p>
        </div>
      ) : archivedSessions.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <svg
            width="32"
            height="32"
            viewBox="0 0 16 16"
            fill="none"
            className="mx-auto mb-3 text-text-muted"
          >
            <path d="M2 4h12v1.5H2V4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M3 5.5v7h10v-7" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-text-muted">{t('archivedThreads.noArchivedThreads')}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {archivedSessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg
                         hover:bg-surface-hover transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-text-primary truncate">{session.title || t('archivedThreads.untitled')}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-muted">{session.projectName}</span>
                  {session.archivedAt && (
                    <>
                      <span className="text-xs text-text-muted">·</span>
                      <span className="text-xs text-text-muted">
                        {new Date(session.archivedAt).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleUnarchive(session)}
                className="shrink-0 px-2 py-1 rounded text-xs
                           text-accent hover:bg-surface transition-colors"
              >
                {t('archivedThreads.unarchive')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
