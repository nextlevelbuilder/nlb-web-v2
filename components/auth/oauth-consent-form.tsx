'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

const scopeDescriptions: Record<string, string> = {
  'mcp:read': 'Read directory information and account data available to you.',
  'mcp:write': 'Act on your behalf: submit and update products, upload media, vote, and start checkout.',
  'mcp:keys': 'Create, list, and revoke API keys. Created keys can provide long-lived account access after this connection ends.',
  offline_access: 'Keep this connection active using a renewable token when you are away.',
};
const scopeLabels: Record<string, string> = {
  'mcp:read': 'Read information', 'mcp:write': 'Make changes', 'mcp:keys': 'Manage API keys', offline_access: 'Stay connected',
};

export default function OAuthConsentForm({ clientName, clientId, accountEmail, scopes, oauthQuery, resource }: {
  clientName: string; clientId: string; accountEmail: string; scopes: string[]; oauthQuery: string; resource: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function decide(accept: boolean) {
    setPending(true);
    setError('');
    try {
      const result = await authClient.oauth2.consent({ accept, oauth_query: oauthQuery });
      if (result.error) throw new Error(result.error.message || 'Authorization failed.');
      if (!result.data?.url) throw new Error('Missing authorization continuation.');
      // Only the provider chooses this registered client redirect after validating consent.
      window.location.assign(result.data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authorization failed.');
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="consent-title" className="surface-panel w-full max-w-xl space-y-6 p-6 shadow-constellation sm:p-8">
      <div className="space-y-3">
        <p className="eyebrow">MCP · OAuth</p>
        <h1 id="consent-title" className="font-display text-step-2xl font-light">Connect {clientName}?</h1>
        <p className="text-step-base text-ink-2">Signed in as <strong className="break-all font-medium text-foreground">{accountEmail}</strong>.</p>
        <p className="text-step-sm text-ink-2">This application is requesting access to Next Level Builder through MCP. Approve only if you recognize it.</p>
        <p className="break-all font-mono text-step-xs text-ink-3">Client ID: {clientId}</p>
        <p className="break-all font-mono text-step-xs text-ink-3">Server: {resource}</p>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {scopes.map(scope => <li key={scope} className="space-y-1 py-4">
          <strong className="text-step-base font-medium">{scopeLabels[scope]}</strong>
          <p className="text-step-sm text-ink-2">{scopeDescriptions[scope]}</p>
        </li>)}
      </ul>
      <p className="text-step-sm text-ink-2">Your account permissions still apply. Manage access from <a className="text-foreground underline underline-offset-4" href="/oauth/connections" target="_blank" rel="noreferrer">connected applications</a>. Separately revoke any API keys it created from your profile.</p>
      {error && <p role="alert" className="rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-step-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={pending} onClick={() => decide(false)}>Deny</Button>
        <Button disabled={pending} onClick={() => decide(true)}>{pending ? 'Continuing…' : 'Allow access'}</Button>
      </div>
    </section>
  );
}
