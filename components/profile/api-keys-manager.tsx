'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  X,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  start: string;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  organizationId?: string | null;
}

export default function ApiKeysManager() {
  const t = useTranslations('profile');
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [expiresDays, setExpiresDays] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Load API keys
  const loadKeys = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/api-keys');
      const data = await res.json();
      if (res.ok && data.success) {
        setKeys(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  // Create Key Handler
  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName.trim(),
          expiresDays,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create API key');
      }

      setNewlyCreatedKey(data.data.key);
      setKeyName('');
      setExpiresDays(undefined);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to generate key');
    } finally {
      setIsCreating(false);
    }
  };

  // Revoke Key Handler
  const handleRevokeKey = async (id: string) => {
    setRevokingId(id);
    setError(null);

    try {
      const res = await fetch(`/api/v1/api-keys/${id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to revoke API key');
      }

      setSuccess(t('revokedSuccess'));
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to delete key');
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // Clipboard access can be denied; the key stays selectable (select-all) for manual copy.
    }
  };

  return (
    <section aria-labelledby="api-keys-title" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 id="api-keys-title" className="flex items-center gap-2 font-display text-step-xl text-foreground">
            <Key aria-hidden className="w-4 h-4 text-primary" />
            {t('apiKeysTitle')}
          </h2>
          <p className="mt-2 max-w-2xl text-step-sm leading-relaxed text-ink-2">
            {t('apiKeysDesc')}
          </p>
        </div>
      </div>

      <div aria-live="polite" className="space-y-3 empty:hidden">
        {error && (
          <div role="alert" className="flex items-center gap-2.5 rounded-sm border border-destructive/50 bg-destructive/10 p-3.5 text-step-sm text-foreground">
            <AlertCircle aria-hidden className="w-4 h-4 shrink-0 text-destructive" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div role="status" className="flex items-center gap-2.5 rounded-sm border border-success/50 bg-success/10 p-3.5 text-step-sm text-foreground">
            <CheckCircle2 aria-hidden className="w-4 h-4 shrink-0 text-success" />
            <span>{success}</span>
          </div>
        )}
      </div>

      {/* Secret Key Alert Box (Displayed ONLY after creation) */}
      {newlyCreatedKey && (
        <div role="region" aria-labelledby="new-key-title" className="space-y-3 rounded-sm border border-warning/50 bg-warning/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 id="new-key-title" className="flex items-center gap-2 text-step-base font-medium text-foreground">
              <ShieldCheck aria-hidden className="w-5 h-5 shrink-0 text-warning" />
              <span>{t('newKeyAlertTitle')}</span>
            </h3>
            <button
              type="button"
              onClick={() => setNewlyCreatedKey(null)}
              aria-label="Dismiss"
              className="inline-flex h-10 w-10 items-center justify-center rounded-sm text-ink-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="w-4 h-4" />
            </button>
          </div>

          <p className="text-step-sm leading-relaxed text-ink-2">{t('newKeyAlertDesc')}</p>

          <div className="flex flex-wrap items-center gap-2 rounded-sm border border-warning/50 bg-canvas-deep p-3 font-mono text-step-xs text-foreground">
            <code className="min-w-0 flex-1 break-all select-all">{newlyCreatedKey}</code>
            <Button
              type="button"
              size="sm"
              onClick={() => copyToClipboard(newlyCreatedKey)}
              className="gap-1.5 shrink-0"
            >
              {copiedKey ? (
                <>
                  <Check aria-hidden className="w-3.5 h-3.5" />
                  <span>{t('keyCopied')}</span>
                </>
              ) : (
                <>
                  <Copy aria-hidden className="w-3.5 h-3.5" />
                  <span>{t('copyKeyBtn')}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Key Generation Form */}
      <form onSubmit={handleCreateKey} className="space-y-4 rounded-sm border border-line bg-surface p-5">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-7 space-y-1.5">
            <label htmlFor="api-key-name" className="mono-label block text-ink-3">
              {t('keyNameLabel')}
            </label>
            <input
              id="api-key-name"
              type="text"
              autoComplete="off"
              placeholder={t('keyNamePlaceholder')}
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="h-11 w-full rounded-sm border border-input bg-surface px-3.5 text-step-sm text-foreground placeholder:text-ink-3 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </div>

          <div className="sm:col-span-3 space-y-1.5">
            <label htmlFor="api-key-expiry" className="mono-label block text-ink-3">
              {t('expiresLabel')}
            </label>
            <select
              id="api-key-expiry"
              value={expiresDays || ''}
              onChange={(e) => setExpiresDays(e.target.value ? Number(e.target.value) : undefined)}
              className="h-11 w-full cursor-pointer rounded-sm border border-input bg-surface px-3 text-step-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t('expiresNever')}</option>
              <option value="30">{t('expires30')}</option>
              <option value="90">{t('expires90')}</option>
              <option value="365">{t('expires365')}</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={isCreating || !keyName.trim()}
              className="w-full gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 aria-hidden className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('generating')}</span>
                </>
              ) : (
                <>
                  <Plus aria-hidden className="w-3.5 h-3.5" />
                  <span>{t('generateBtn')}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Active API Keys List */}
      <div className="space-y-3">
        {loading ? (
          <div role="status" className="flex items-center justify-center gap-2 rounded-sm border border-line bg-surface p-8 text-center text-step-sm text-ink-2">
            <Loader2 aria-hidden className="w-4 h-4 animate-spin text-primary" />
            <span>Loading active API keys...</span>
          </div>
        ) : keys.length === 0 ? (
          <div className="surface-panel space-y-2 p-8 text-center">
            <Key aria-hidden className="mx-auto w-8 h-8 text-ink-3" strokeWidth={1.25} />
            <p className="text-step-sm text-ink-2">{t('noKeys')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-line bg-surface">
            <table className="w-full min-w-[34rem] text-left text-step-sm">
              <thead className="bg-surface-raised">
                <tr className="mono-label text-ink-3">
                  <th scope="col" className="p-3 font-normal">{t('keyColumnName')}</th>
                  <th scope="col" className="p-3 font-normal">{t('keyColumnPrefix')}</th>
                  <th scope="col" className="p-3 font-normal">{t('keyColumnCreated')}</th>
                  <th scope="col" className="p-3 font-normal">{t('keyColumnStatus')}</th>
                  <th scope="col" className="p-3 text-right font-normal">{t('keyColumnAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="p-3 font-medium text-foreground">{k.name}</td>
                    <td className="p-3 font-mono text-step-xs text-ink-2">{k.prefix || `${k.start}…`}</td>
                    <td className="p-3 text-ink-2">{new Date(k.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="border-success/50 text-success">
                        Active
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={revokingId === k.id}
                        onClick={() => handleRevokeKey(k.id)}
                        aria-label={`${t('revokeKeyBtn')}: ${k.name}`}
                        className="gap-1 hover:text-destructive"
                      >
                        {revokingId === k.id ? (
                          <Loader2 aria-hidden className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 aria-hidden className="w-3.5 h-3.5" />
                        )}
                        <span>{t('revokeKeyBtn')}</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </section>
  );
}
