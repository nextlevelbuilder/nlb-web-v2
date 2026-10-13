import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getOAuthAuth } from '@/lib/auth';
import { isMcpOAuthEnabled } from '@/lib/mcp-oauth-config';
import OAuthConnections from '@/components/auth/oauth-connections';

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
  return <main className="mx-auto max-w-2xl space-y-6 px-6 py-28">
    <h1 className="text-3xl font-bold">Connected applications</h1>
    <p className="text-muted-foreground">Manage MCP access to {session.user.email}. Disconnecting stops token renewal. Existing access expires within five minutes.</p>
    <OAuthConnections connections={connections} />
    <p className="text-sm text-muted-foreground">Long-lived API keys remain active until you revoke them from your <a href="/profile" className="underline">profile</a>.</p>
  </main>;
}
