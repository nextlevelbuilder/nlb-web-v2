import { headers } from 'next/headers';
import { getOAuthAuth } from '@/lib/auth';
import { getMcpOAuthResource, MCP_OAUTH_SCOPES, isMcpOAuthEnabled } from '@/lib/mcp-oauth-config';
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
  const scopes = [...new Set((params.get('scope') || '').split(' ').filter(Boolean))];
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
    details = { clientName: client.client_name || clientId, accountEmail: session.user.email };
  } catch {
    return <main className="mx-auto max-w-xl px-6 py-32"><h1 className="text-2xl font-bold">Authorization request expired or invalid</h1><p className="mt-4">Restart the connection from your MCP client to sign in and review access.</p></main>;
  }
  return <main className="min-h-screen flex items-center justify-center px-4 py-24"><OAuthConsentForm {...details} clientId={clientId} scopes={scopes} oauthQuery={oauthQuery} resource={resource} /></main>;
}
