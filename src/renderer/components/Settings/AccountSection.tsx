import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, pullFromServer } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';

export function AccountSection() {
  const { t } = useTranslation();
  const { settings, updateServer } = useSettingsStore();
  const { user, token, login, register, logout, updateProfile, changePassword } = useAuthStore();
  const [defaultServerUrl, setDefaultServerUrl] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Login form
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [newUsername, setNewUsername] = useState('');

  useEffect(() => {
    window.api.auth.getDefaultServerUrl().then(setDefaultServerUrl).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) setNewUsername(user.username);
  }, [user]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const url = settings.server.serverUrl || defaultServerUrl || 'http://localhost:3456';
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/api/health`);
      const data = await res.json();
      if (data.status === 'ok') {
        setTestResult({ ok: true, message: t('account.connected', { version: data.version }) });
      } else {
        setTestResult({ ok: false, message: t('account.unexpectedResponse') });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || t('account.connectionFailed') });
    } finally {
      setTesting(false);
    }
  };

  const handleAuth = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const result = loginMode === 'login'
        ? await login(email || username, password)
        : await register(email, username, password);
      if (!result.success) {
        setAuthError(result.error || t('account.authenticationFailed'));
      }
    } catch (err: any) {
      setAuthError(err.message || t('account.connectionError'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      await pullFromServer();
      setSyncResult(t('account.settingsSynced'));
    } catch {
      setSyncResult(t('account.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!newUsername.trim()) return;
    const result = await updateProfile({ username: newUsername.trim() });
    if (!result.success) {
      setAuthError(result.error || t('account.updateFailed'));
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (!oldPassword || !newPassword) {
      setPasswordError(t('account.allFieldsRequired'));
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError(t('account.minLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('account.passwordsNotMatch'));
      return;
    }
    setChangingPassword(true);
    try {
      const result = await changePassword(oldPassword, newPassword);
      if (result.success) {
        setPasswordSuccess(t('account.passwordChanged'));
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setShowPasswordChange(false), 1500);
      } else {
        setPasswordError(result.error || t('account.failedToChange'));
      }
    } catch (err: any) {
      setPasswordError(err.message || t('account.connectionError'));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-1">{t('account.title')}</h2>
      <p className="text-sm text-text-muted mb-6">
        {t('account.description')}
      </p>

      <div className="space-y-6">
        {/* Server URL */}
        <div>
          <label className="text-sm font-medium text-text-primary block mb-1">{t('account.serverUrl')}</label>
          <p className="text-xs text-text-muted mb-2">
            {t('account.serverUrlDesc')}
          </p>
          <input
            type="text"
            value={settings.server.serverUrl}
            onChange={(e) => updateServer({ serverUrl: e.target.value })}
            placeholder={defaultServerUrl || 'http://localhost:3456'}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg
                       text-sm text-text-primary outline-none
                       focus:border-accent/50 transition-colors
                       placeholder:text-text-muted/50"
          />
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="px-3 py-1.5 text-xs text-white bg-accent rounded-lg
                         hover:bg-accent/90 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? t('account.testing') : t('account.testConnection')}
            </button>
            {testResult && (
              <span className={`text-xs ${testResult.ok ? 'text-success' : 'text-error'}`}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Logged in state */}
        {user && token ? (
          <>
            {/* User info */}
            <div>
              <h3 className="text-sm font-medium text-text-primary mb-3">{t('account.signedIn')}</h3>
              <div className="flex items-center gap-3 p-3 bg-surface rounded-lg">
                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-semibold text-sm">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{user.username}</p>
                  <p className="text-xs text-text-muted truncate">{user.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 text-xs text-text-secondary
                             border border-border rounded-lg
                             hover:text-text-primary hover:bg-surface-hover
                             transition-colors"
                >
                  {t('account.signOut')}
                </button>
              </div>
            </div>

            {/* Edit username */}
            <div>
              <label className="text-sm font-medium text-text-primary block mb-1">{t('account.username')}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="flex-1 px-3 py-2 bg-bg border border-border rounded-lg
                             text-sm text-text-primary outline-none
                             focus:border-accent/50 transition-colors"
                />
                <button
                  onClick={handleUpdateProfile}
                  disabled={newUsername.trim() === user.username}
                  className="px-3 py-2 text-xs text-white bg-accent rounded-lg
                             hover:bg-accent/90 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>

            {/* Change password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-text-primary">{t('account.password')}</label>
                {!showPasswordChange && (
                  <button
                    onClick={() => {
                      setShowPasswordChange(true);
                      setPasswordError('');
                      setPasswordSuccess('');
                    }}
                    className="text-xs text-accent hover:text-accent/80 transition-colors"
                  >
                    {t('account.changePassword')}
                  </button>
                )}
              </div>
              {showPasswordChange && (
                <div className="space-y-2 mt-2">
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder={t('account.currentPassword')}
                    className="w-full px-3 py-2 bg-bg border border-border rounded-lg
                               text-sm text-text-primary outline-none
                               focus:border-accent/50 transition-colors
                               placeholder:text-text-muted/50"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('account.newPassword')}
                    className="w-full px-3 py-2 bg-bg border border-border rounded-lg
                               text-sm text-text-primary outline-none
                               focus:border-accent/50 transition-colors
                               placeholder:text-text-muted/50"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('account.confirmNewPassword')}
                    onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                    className="w-full px-3 py-2 bg-bg border border-border rounded-lg
                               text-sm text-text-primary outline-none
                               focus:border-accent/50 transition-colors
                               placeholder:text-text-muted/50"
                  />
                  {passwordError && (
                    <p className="text-xs text-error">{passwordError}</p>
                  )}
                  {passwordSuccess && (
                    <p className="text-xs text-success">{passwordSuccess}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleChangePassword}
                      disabled={changingPassword}
                      className="px-3 py-1.5 text-xs text-white bg-accent rounded-lg
                                 hover:bg-accent/90 transition-colors
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {changingPassword ? t('common.loading') : t('account.changePassword')}
                    </button>
                    <button
                      onClick={() => {
                        setShowPasswordChange(false);
                        setOldPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordError('');
                        setPasswordSuccess('');
                      }}
                      className="px-3 py-1.5 text-xs text-text-secondary
                                 border border-border rounded-lg
                                 hover:text-text-primary hover:bg-surface-hover
                                 transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sync settings */}
            <div>
              <h3 className="text-sm font-medium text-text-primary mb-1">{t('account.settingsSync')}</h3>
              <p className="text-xs text-text-muted mb-2">
                {t('account.settingsSyncDesc')}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="px-3 py-1.5 text-xs text-white bg-accent rounded-lg
                             hover:bg-accent/90 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncing ? t('account.syncing') : t('account.syncNow')}
                </button>
                {syncResult && (
                  <span className="text-xs text-success">{syncResult}</span>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Login / Register form */
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-3">
              {loginMode === 'login' ? t('account.signIn') : t('account.createAccount')}
            </h3>
            <div className="space-y-3">
              {loginMode === 'register' && (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('account.email')}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg
                             text-sm text-text-primary outline-none
                             focus:border-accent/50 transition-colors
                             placeholder:text-text-muted/50"
                />
              )}
              <input
                type="text"
                value={loginMode === 'register' ? username : email}
                onChange={(e) => loginMode === 'register' ? setUsername(e.target.value) : setEmail(e.target.value)}
                placeholder={loginMode === 'register' ? t('account.usernamePlaceholder') : t('account.emailOrUsername')}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg
                           text-sm text-text-primary outline-none
                           focus:border-accent/50 transition-colors
                           placeholder:text-text-muted/50"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('account.passwordPlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg
                           text-sm text-text-primary outline-none
                           focus:border-accent/50 transition-colors
                           placeholder:text-text-muted/50"
              />

              {authError && (
                <p className="text-xs text-error">{authError}</p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAuth}
                  disabled={authLoading}
                  className="px-4 py-2 text-xs text-white bg-accent rounded-lg
                             hover:bg-accent/90 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {authLoading ? t('account.pleaseWait') : loginMode === 'login' ? t('account.signIn') : t('account.createAccount')}
                </button>
                <button
                  onClick={() => {
                    setLoginMode(loginMode === 'login' ? 'register' : 'login');
                    setAuthError('');
                  }}
                  className="text-xs text-accent hover:text-accent/80 transition-colors"
                >
                  {loginMode === 'login' ? t('account.createAccount') : t('account.alreadyHaveAccount')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
