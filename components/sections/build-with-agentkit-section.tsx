import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import CopyButton from '@/components/home/copy-button';
import SectionPlate from '@/components/home/section-plate';
import { Link } from '@/i18n/navigation';
import { API_DOCS_PATH, TEAM_PRODUCTS, TOOLKIT_COMMANDS, TOOLKITS_REPO_URL, pick } from '@/lib/constants/home-content';
import type { HomeLaunchedProduct } from '@/lib/home/home-page-data';

const CLI_STEPS = [
  { comment: 'step1', commands: [TOOLKIT_COMMANDS.template] },
  { comment: 'step2', commands: [TOOLKIT_COMMANDS.validate, TOOLKIT_COMMANDS.preview] },
  { comment: 'step3', commands: [TOOLKIT_COMMANDS.submit] },
] as const;
const CLI_SCRIPT = CLI_STEPS.flatMap((step) => step.commands).join('\n');

/** Product mark: self-hosted logo or an initial in the display face when there is none. */
function Mark({ src, name }: { src: string | null; name: string }) {
  return src ? (
    <Image src={src} alt="" width={40} height={40} unoptimized className="h-10 w-10 shrink-0 rounded-sm object-contain" />
  ) : (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-line-strong font-display text-step-lg italic text-primary">
      {name.charAt(0)}
    </span>
  );
}

/**
 * Chapter VII · Toolkits: real Directory CLI and MCP commands, products launched by members (live from
 * the catalog, hidden when it cannot be read) and the products built by the NLB team.
 */
export default function BuildWithAgentKitSection({ launchedProducts }: { launchedProducts: HomeLaunchedProduct[] | null }) {
  const t = useTranslations('home.toolkits');
  const tShell = useTranslations('shell.footer');
  const locale = useLocale();

  return (
    <section id="toolkits" aria-labelledby="toolkits-title" className="section-pad">
      <div className="wrap grid gap-12 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <SectionPlate numeral="VII" name={t('plate')} />
          <h2 id="toolkits-title" className="h-section">{t.rich('title', { em: (chunks) => <em>{chunks}</em> })}</h2>
          <p className="lede mt-6">{t('body')}</p>
          <p className="mt-4 max-w-[52ch] text-step-sm text-ink-2">{t('mcp')}</p>
          <div className="mt-8 flex flex-wrap gap-x-6">
            <a href={API_DOCS_PATH} className="link-arrow">{t('docs')} <span aria-hidden="true">→</span></a>
            <a href={TOOLKITS_REPO_URL} target="_blank" rel="noopener noreferrer" className="link-arrow">
              GitHub <span aria-hidden="true">↗</span><span className="sr-only"> {tShell('newTab')}</span>
            </a>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <figure className="min-w-0 rounded-sm border border-line-strong bg-canvas-deep">
            <figcaption className="flex items-center justify-between gap-3 border-b border-line py-1 pl-4 pr-1">
              <span className="mono-label text-ink-3">{t('terminalLabel')}</span>
              <CopyButton text={CLI_SCRIPT} label={t('copyCli')} />
            </figcaption>
            <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-relaxed" tabIndex={0} aria-label={t('terminalLabel')}>
              <code>
                {CLI_STEPS.map((step, index) => (
                  <span key={step.comment} className={index > 0 ? 'mt-3 block' : 'block'}>
                    <span className="text-ink-3">{t(step.comment)}</span>
                    {step.commands.map((command) => (
                      <span key={command} className="block text-foreground">
                        <span className="select-none text-primary" aria-hidden="true">$ </span>
                        {command}
                      </span>
                    ))}
                  </span>
                ))}
              </code>
            </pre>
          </figure>
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-sm border border-line py-1 pl-4 pr-1">
            <code className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-[0.8125rem] text-foreground">{TOOLKIT_COMMANDS.mcp}</code>
            <CopyButton text={TOOLKIT_COMMANDS.mcp} label={t('copyMcp')} />
          </div>
        </div>
      </div>

      {launchedProducts && (
        <div className="wrap mt-20">
          <h3 className="mono-label text-ink-3">{t('liveTitle')}</h3>
          {launchedProducts.length === 0 ? (
            <p className="mt-6 rounded-sm border border-dashed border-line-strong p-8 text-center font-display text-step-xl text-ink-2">
              {t('liveEmpty')}
            </p>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {launchedProducts.map((product) => (
                <li key={product.slug}>
                  <Link
                    href={`/products/${product.slug}`}
                    aria-label={t('viewProduct', { name: product.title })}
                    className="surface-panel flex h-full items-start gap-4 p-5 transition-colors duration-base hover:border-line-strong"
                  >
                    <Mark src={product.logoUrl} name={product.title} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-step-lg">{product.title}</span>
                      <span className="mt-1 line-clamp-2 block text-step-sm text-ink-2">{product.tagline}</span>
                    </span>
                    <span className="mono-label shrink-0 text-ink-3">{t('trust', { score: product.trustScore })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="wrap mt-20">
        <h3 className="mono-label text-ink-3">{t('teamTitle')}</h3>
        <ul className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-line bg-line min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {TEAM_PRODUCTS.map((product) => (
            <li key={product.id} className="bg-background">
              <a href={product.url} target="_blank" rel="noopener noreferrer" className="flex h-full items-center gap-3 p-4 transition-colors duration-base hover:bg-surface">
                <Mark src={product.logo} name={product.name} />
                <span className="min-w-0">
                  <span className="block text-step-sm font-medium text-foreground">{product.name}</span>
                  <span className="block text-step-xs text-ink-3">{pick(product.tagline, locale)}</span>
                </span>
                <span className="sr-only"> {tShell('newTab')}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
