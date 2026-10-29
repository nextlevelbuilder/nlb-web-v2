import { headers } from 'next/headers';
import { getOAuthAuth } from '@/lib/auth';
import { getMcpOAuthResource, MCP_OAUTH_SCOPES, MCP_OPERATOR_SCOPE, isMcpOAuthEnabled } from '@/lib/mcp-oauth-config';
import { getDb } from '@/lib/db';
import { getOperatorCapabilities } from '@/lib/operators/operator-grants';
import { notFound } from 'next/navigation';
import OAuthConsentForm from '@/components/auth/oauth-consent-form';

export const dynamic = 'force-dynamic';

export default async function OAuthConsentPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isMcpOAuthEnabled()) notFound();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  const oauthQuery = params.toString();
  const clientId = params.get('client_id') || '';
  let scopes = [...new Set((params.get('scope') || '').split(' ').filter(Boolean))];
  const resource = getMcpOAuthResource();
  const auth = getOAuthAuth();
  const requestHeaders = await headers();
  let details;
  try {
    if (!params.has('sig') || !params.has('ba_param') || !clientId ||
        scopes.some(scope => !MCP_OAUTH_SCOPES.includes(scope)) ||
        params.getAll('resource').length !== 1 || params.get('resource') !== resource) throw new Error('Invalid authorization request');
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) throw new Error('Sign-in expired');
    // This endpoint verifies oauth_query before returning the registered client name.
    const client = await auth.api.getOAuthClientPublicPrelogin({
      headers: requestHeaders,
      body: { client_id: clientId, oauth_query: oauthQuery },
    });
    // Only platform operators are offered mcp:operator; the consent endpoint drops it for everyone else too.
    if (scopes.includes(MCP_OPERATOR_SCOPE) && !(await getOperatorCapabilities(getDb(), session.user.id)).length) {
      scopes = scopes.filter(scope => scope !== MCP_OPERATOR_SCOPE);
    }
    details = { clientName: client.client_name || clientId, accountEmail: session.user.email };
  } catch {
    return <main id="main" className="sky-backdrop flex min-h-screen items-center justify-center bg-background px-5 py-24 text-foreground"><div className="surface-panel w-full max-w-xl p-6 sm:p-8"><p className="eyebrow mb-4">MCP · OAuth</p><h1 className="font-display text-step-2xl font-light">Authorization request expired or invalid</h1><p className="mt-4 text-step-base text-ink-2">Restart the connection from your MCP client to sign in and review access.</p></div></main>;
  }
  return <main id="main" className="sky-backdrop flex min-h-screen items-center justify-center bg-background px-4 py-24 text-foreground"><OAuthConsentForm {...details} clientId={clientId} scopes={scopes} oauthQuery={oauthQuery} resource={resource} /></main>;
}
