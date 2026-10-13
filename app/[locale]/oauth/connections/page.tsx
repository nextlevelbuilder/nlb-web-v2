import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getOAuthAuth } from '@/lib/auth';
import { isMcpOAuthEnabled } from '@/lib/mcp-oauth-config';
import OAuthConnections from '@/components/auth/oauth-connections';
import { Link } from '@/i18n/navigation';

export const dynamic = 'force-dynamic';

export default async function OAuthConnectionsPage() {
  if (!isMcpOAuthEnabled()) notFound();
  const auth = getOAuthAuth();
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect('/sign-in?callbackUrl=%2Foauth%2Fconnections');
  const consents = await auth.api.getOAuthConsents({ headers: requestHeaders });
  const connections = await Promise.all(consents.map(async consent => {
    const client = await auth.api.getOAuthClientPublic({ headers: requestHeaders, query: { client_id: consent.clientId } });
    return { id: consent.id, clientId: consent.clientId, name: client.client_name || consent.clientId, scopes: consent.scopes };
  }));
  return <main id="main" className="sky-backdrop min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-2xl space-y-8 px-5 py-24 sm:px-6">
      <header className="space-y-4">
        <p className="eyebrow">MCP · OAuth</p>
        <h1 className="font-display text-step-2xl font-light">Connected applications</h1>
        <p className="text-step-base text-ink-2">Manage MCP access to <strong className="break-all font-medium text-foreground">{session.user.email}</strong>. Disconnecting stops token renewal. Existing access expires within five minutes.</p>
      </header>
      <OAuthConnections connections={connections} />
      <p className="border-t border-line pt-6 text-step-sm text-ink-3">Long-lived API keys remain active until you revoke them from your <Link href="/profile" className="text-foreground underline underline-offset-4">profile</Link>.</p>
    </div>
  </main>;
}
