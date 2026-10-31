import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TEAM_PRODUCTS, TOOLKIT_MCP, pick } from '@/lib/constants/home-content';
import type { HomeLaunchedProduct } from '@/lib/home/home-page-data';
import ChapterPlate from './chapter-plate';
import SplitText from './split-text';
import TerminalCopyButton from './terminal-copy-button';

/**
 * Chapter VII · transmission: how to connect an MCP client to the official /mcp endpoint, then the products members
 * launched through it and the products built by the NLB team.
 */
export default function ToolkitsChapter({ launched }: { launched: HomeLaunchedProduct[] | null }) {
  const t = useTranslations('home.toolkits');
  const tShell = useTranslations('shell.footer');
  const locale = useLocale();

  return (
    <section className="chapter section" id="toolkits" aria-labelledby="tool-title" data-ch="7">
      <div className="wrap">
        <ChapterPlate numeral="VII" name={t('plate')} coord="Altair · RA 19h 50m · Dec +08° 52′" />
        <div className="tool-grid">
          <div className="tool-copy">
            <SplitText id="tool-title" className="h2" text={t.raw('title') as string} />
            <p className="lede">{t('body')}</p>
            <p className="lede">{t('mcp')}</p>
            <Link className="link-arrow" href="/mcp-server">{t('docs')} <span aria-hidden="true">→</span></Link>
          </div>
          <div className="surface term">
            <div className="term-bar">
              <span className="dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="mono">~ — nlb mcp</span>
              <TerminalCopyButton text={TOOLKIT_MCP.claudeCode} label={t('copyClaudeCode')} />
            </div>
            <pre aria-label={t('terminalLabel')}><code id="mcp-setup">
              <span className="ln c">{t('step1')}</span>
              <span className="ln"><span className="p">$ </span>{TOOLKIT_MCP.claudeCode}</span>
              <span className="ln c"> </span>
              <span className="ln c">{t('step2')}</span>
              <span className="ln c"> </span>
              <span className="ln c">{t('step3')}</span>
              {TOOLKIT_MCP.clientConfig.split('\n').map((line, i) => <span className="ln" key={i}>{line}</span>)}
            </code></pre>
            <div className="term-mcp">
              <span><span className="mono mcp-k">{t('endpointLabel')}</span><code id="mcp-code">{TOOLKIT_MCP.endpoint}</code></span>
              <TerminalCopyButton text={TOOLKIT_MCP.endpoint} label={t('copyMcp')} />
            </div>
          </div>
        </div>

        {launched !== null && (
          <div className="catalogue">
            <h3 className="catalogue-head mono"><span>{t('liveTitle')}</span><span className="rule" aria-hidden="true" /></h3>
            {launched.length ? (
              <ul className="launches">
                {launched.map((product) => (
                  <li className="surface launch" key={product.slug}>
                    {product.logoUrl ? (
                      <Image src={product.logoUrl} alt="" width={40} height={40} unoptimized />
                    ) : (
                      <span className="q-mark" aria-hidden="true">{product.title.charAt(0)}</span>
                    )}
                    <div>
                      <strong><Link className="lb-link" href={`/products/${product.slug}`} aria-label={t('viewProduct', { name: product.title })}>{product.title}</Link></strong>
                      <p>{product.tagline}</p>
                      <span className="mono">{t('trust', { score: Math.round(product.trustScore) })}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="launch-empty">{t('liveEmpty')}</p>
            )}
          </div>
        )}

        <div className="catalogue">
          <h3 className="catalogue-head mono"><span>{t('teamTitle')}</span><span className="rule" aria-hidden="true" /></h3>
          <ul className="fleet">
            {TEAM_PRODUCTS.map((product) => {
              const body = (
                <>
                  {product.logo ? (
                    <Image src={product.logo} alt="" width={32} height={32} unoptimized />
                  ) : (
                    <span className="q-mark" aria-hidden="true">{product.name.charAt(0)}</span>
                  )}
                  <strong>{product.name}</strong>
                  <span>{pick(product.tagline, locale)}</span>
                </>
              );
              // Tools with a directory listing open it; the rest go to their own site in a new tab.
              return (
                <li key={product.id}>
                  {product.directorySlug ? (
                    <Link href={`/products/${product.directorySlug}`}>{body}</Link>
                  ) : (
                    <a href={product.url} target="_blank" rel="noopener noreferrer">
                      {body}
                      <span className="sr-only"> {tShell('newTab')}</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
