'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

export default function OAuthConnections({ connections }: {
  connections: { id: string; clientId: string; name: string; scopes: string[] }[];
}) {
  const [items, setItems] = useState(connections);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function disconnect(id: string) {
    setPending(id);
    setError('');
    try {
      const result = await authClient.oauth2.deleteConsent({ id });
      if (result.error) throw new Error(result.error.message || 'Could not disconnect application.');
      setItems(current => current.filter(item => item.id !== id));
      setNotice('Disconnected. Existing access expires within five minutes. API keys created by this application must be revoked separately from your profile.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect application.');
    } finally {
      setPending('');
    }
  }

  return <section className="space-y-6">
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {!items.length && <p className="text-muted-foreground">No connected applications.</p>}
    {items.map(item => <article key={item.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="font-semibold">{item.name}</h2>
      <p className="text-xs text-muted-foreground break-all">Client ID: {item.clientId}</p>
      <p className="text-sm text-muted-foreground">Permissions: {item.scopes.join(', ')}</p>
      <Button variant="outline" disabled={!!pending} onClick={() => disconnect(item.id)}>{pending === item.id ? 'Disconnecting…' : 'Disconnect'}</Button>
    </article>)}
  </section>;
}
