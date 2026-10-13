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
    <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Connect {clientName}?</h1>
        <p className="text-muted-foreground">Signed in as <strong className="text-foreground">{accountEmail}</strong>.</p>
        <p className="text-sm text-muted-foreground">This application is requesting access to Next Level Builder through MCP. Approve only if you recognize it.</p>
        <p className="text-xs text-muted-foreground break-all">Client ID: {clientId}</p>
        <p className="text-xs text-muted-foreground break-all">Server: {resource}</p>
      </div>
      <ul className="space-y-4">
        {scopes.map(scope => <li key={scope} className="space-y-1">
          <strong className="text-sm">{scopeLabels[scope]}</strong>
          <p className="text-sm text-muted-foreground">{scopeDescriptions[scope]}</p>
        </li>)}
      </ul>
      <p className="text-sm text-muted-foreground">Your account permissions still apply. Manage access from <a className="underline" href="/oauth/connections" target="_blank" rel="noreferrer">connected applications</a>. Separately revoke any API keys it created from your profile.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button variant="outline" disabled={pending} onClick={() => decide(false)}>Deny</Button>
        <Button disabled={pending} onClick={() => decide(true)}>{pending ? 'Continuing…' : 'Allow access'}</Button>
      </div>
    </section>
  );
}
