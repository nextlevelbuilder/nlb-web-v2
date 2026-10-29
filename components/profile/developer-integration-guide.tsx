'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Cpu, KeyRound, ShieldCheck, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';

const MCP_SERVER_NAME = 'nlb-directory';

/** Copies `text` and confirms for two seconds; the result is announced politely. */
function CopySnippetButton({ text, label }: { text: string; label: string }) {
  const t = useTranslations('profile');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const reset = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(reset);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the snippet stays selectable for manual copy.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t('keyCopied') : label}
        className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-line px-2 py-1 font-mono text-step-xs text-ink-2 transition-colors hover:border-primary hover:text-primary"
      >
        {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
        <span aria-hidden>{copied ? t('keyCopied') : t('copySnippet')}</span>
      </button>
      <span role="status" className="sr-only">{copied ? t('keyCopied') : ''}</span>
    </>
  );
}

function Snippet({ title, code, copyLabel }: { title: string; code: string; copyLabel: string }) {
  return (
    <div className="min-w-0 space-y-2 rounded-sm border border-line bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-step-xs text-primary">{title}</span>
        <CopySnippetButton text={code} label={copyLabel} />
      </div>
      <pre className="overflow-x-auto whitespace-pre rounded-sm border border-line bg-canvas-deep p-2.5 font-mono text-step-xs text-foreground">{code}</pre>
    </div>
  );
}

/**
 * Profile quick start for developers. The hosted MCP endpoint (Streamable HTTP, OAuth 2.1 with the
 * NLB account) comes first because it needs no API key; the CLI and the local stdio server, which
 * both run on an API key from `ApiKeysManager` below it, are the alternative.
 */
export default function DeveloperIntegrationGuide({ mcpUrl }: { mcpUrl: string }) {
  const t = useTranslations('profile');
  const claudeCode = `claude mcp add --transport http ${MCP_SERVER_NAME} ${mcpUrl}`;
  const remoteJson = JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { url: mcpUrl } } }, null, 2);
  const cli = 'export NLB_API_KEY="nlb_live_..."\nexport NLB_ORG_ID="<organization id>"\nnpx -y @nextlevelbuilder/cli submit product.json';
  const stdioJson = JSON.stringify(
    { mcpServers: { [MCP_SERVER_NAME]: { command: 'npx', args: ['-y', '@nextlevelbuilder/mcp'], env: { NLB_API_KEY: 'nlb_live_...' } } } },
    null,
    2,
  );

  return (
    <section aria-labelledby="integration-guide-title" className="space-y-5 rounded-sm border border-line bg-canvas-deep p-4 sm:p-6">
      <div className="space-y-2">
        <h2 id="integration-guide-title" className="flex items-center gap-2 font-display text-step-xl text-foreground">
          <Cpu aria-hidden className="h-4 w-4 text-primary" />
          {t('integrationGuideTitle')}
        </h2>
        <p className="max-w-prose text-step-sm text-ink-2">{t('integrationGuideIntro')}</p>
      </div>

      <div className="space-y-4 rounded-sm border border-primary/40 bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-step-base font-medium text-foreground">{t('mcpRemoteTitle')}</h3>
          <Badge variant="outline" className="border-primary/40 text-primary">{t('recommended')}</Badge>
        </div>
        <div className="flex flex-col items-start gap-2 rounded-sm border border-line bg-canvas-deep p-2.5 sm:flex-row sm:items-center sm:gap-3">
          <code className="w-full min-w-0 flex-1 break-all font-mono text-step-sm text-foreground">{mcpUrl}</code>
          <CopySnippetButton text={mcpUrl} label={t('copyMcpUrl')} />
        </div>
        <ul className="space-y-1.5 text-step-xs text-ink-2">
          <li className="flex gap-2">
            <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{t('mcpRemoteAuth')}</span>
          </li>
          <li className="flex gap-2">
            <KeyRound aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              {t('mcpRemoteScopes')}{' '}
              <Link href="/oauth/connections" className="text-primary underline underline-offset-2">
                {t('mcpRemoteConnections')}
              </Link>
            </span>
          </li>
        </ul>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Snippet title="Claude Code" code={claudeCode} copyLabel={t('copySnippetFor', { client: 'Claude Code' })} />
          <Snippet title="Cursor · JSON" code={remoteJson} copyLabel={t('copySnippetFor', { client: 'Cursor' })} />
        </div>
        <p className="text-step-xs text-ink-2">{t('mcpRemoteClaudeApp')}</p>
      </div>

      <details className="group rounded-sm border border-line bg-surface p-3 sm:p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-step-sm font-medium text-foreground">
          <Terminal aria-hidden className="h-4 w-4 text-ink-2" />
          {t('apiKeyAlternativeTitle')}
        </summary>
        <div className="mt-4 space-y-4">
          <p className="text-step-xs text-ink-2">{t('apiKeyAlternativeDesc')}</p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Snippet title="@nextlevelbuilder/cli" code={cli} copyLabel={t('copySnippetFor', { client: 'CLI' })} />
            <Snippet title="@nextlevelbuilder/mcp (stdio)" code={stdioJson} copyLabel={t('copySnippetFor', { client: 'stdio MCP' })} />
          </div>
        </div>
      </details>
    </section>
  );
}
