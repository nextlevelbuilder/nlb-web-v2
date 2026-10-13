'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
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
  Terminal,
  Cpu,
  Globe,
  X,
  Sparkles,
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
    } catch (err: any) {
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
    } catch (err: any) {
      setError(err.message || 'Failed to generate key');
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
    } catch (err: any) {
      setError(err.message || 'Failed to delete key');
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
      // fallback
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">{t('apiKeysTitle')}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            {t('apiKeysDesc')}
          </p>
        </div>
      </div>

      {/* Error / Success Feedback */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Secret Key Alert Box (Displayed ONLY after creation) */}
      {newlyCreatedKey && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 shadow-xl animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <span>{t('newKeyAlertTitle')}</span>
            </div>
            <button
              type="button"
              onClick={() => setNewlyCreatedKey(null)}
              className="text-muted-foreground hover:text-foreground text-xs p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">{t('newKeyAlertDesc')}</p>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-black/70 border border-amber-500/30 font-mono text-xs text-amber-300 overflow-x-auto">
            <span className="flex-1 truncate select-all">{newlyCreatedKey}</span>
            <Button
              type="button"
              size="sm"
              onClick={() => copyToClipboard(newlyCreatedKey)}
              className="rounded-lg gap-1.5 px-3 h-8 bg-amber-500 hover:bg-amber-600 text-black font-bold shrink-0"
            >
              {copiedKey ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('keyCopied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t('copyKeyBtn')}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Key Generation Form */}
      <form onSubmit={handleCreateKey} className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-7 space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('keyNameLabel')}
            </label>
            <input
              type="text"
              placeholder={t('keyNamePlaceholder')}
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div className="sm:col-span-3 space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('expiresLabel')}
            </label>
            <select
              value={expiresDays || ''}
              onChange={(e) => setExpiresDays(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#0B101B] border border-white/10 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
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
              className="w-full rounded-xl gap-2 font-bold shadow-lg btn-premium text-xs py-2.5 h-10"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('generating')}</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
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
          <div className="p-8 text-center rounded-2xl bg-white/[0.01] border border-white/5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Loading active API keys...</span>
          </div>
        ) : keys.length === 0 ? (
          <Card className="p-8 bg-white/[0.01] border-white/5 rounded-2xl text-center space-y-2">
            <Key className="w-8 h-8 text-muted-foreground mx-auto opacity-30" />
            <p className="text-xs text-muted-foreground">{t('noKeys')}</p>
          </Card>
        ) : (
          <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.01]">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.04] text-muted-foreground font-mono uppercase text-[10px]">
                <tr>
                  <th className="p-3">{t('keyColumnName')}</th>
                  <th className="p-3">{t('keyColumnPrefix')}</th>
                  <th className="p-3">{t('keyColumnCreated')}</th>
                  <th className="p-3">{t('keyColumnStatus')}</th>
                  <th className="p-3 text-right">{t('keyColumnAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-3 font-semibold text-foreground">{k.name}</td>
                    <td className="p-3 font-mono text-muted-foreground">{k.prefix || `${k.start}…`}</td>
                    <td className="p-3 text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono">
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
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 gap-1 rounded-lg"
                      >
                        {revokingId === k.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Developer Integration Quick Start Snippets */}
      <div className="p-6 rounded-2xl bg-black/40 border border-white/10 space-y-4 shadow-lg">
        <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          {t('integrationGuideTitle')}
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CLI Guide */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Terminal className="w-3.5 h-3.5" />
              <span>@nextlevelbuilder/cli</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Authenticate local CLI commands:</p>
            <pre className="p-2.5 rounded-lg bg-black/80 font-mono text-[11px] text-emerald-400 overflow-x-auto">
              nlb submit product.json --api-key nlb_live_...
              <br />
              # Or via environment variable:
              <br />
              export NLB_API_KEY=&quot;nlb_live_...&quot;
              <br />
              nlb submit product.json
            </pre>
          </div>

          {/* MCP Server Guide */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
              <Cpu className="w-3.5 h-3.5" />
              <span>Cursor / Claude Desktop MCP</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Configure in your MCP settings file:</p>
            <pre className="p-2.5 rounded-lg bg-black/80 font-mono text-[11px] text-cyan-300 overflow-x-auto">
              npx -y @nextlevelbuilder/mcp
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
