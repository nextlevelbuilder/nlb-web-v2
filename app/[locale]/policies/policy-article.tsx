import { Link } from '@/i18n/navigation';
import type { PolicyDocument } from '@/content/policies';
import type { PolicyUiCopy } from '@/content/policies/policy-ui-copy';
import { PolicyContent } from './policy-content';

type Props = {
  doc: PolicyDocument;
  copy: PolicyUiCopy;
  eyebrow: string;
  lastUpdated: string;
  /** Hide the "back to overview" link on the overview itself. */
  showBackLink?: boolean;
  /** Legal documents are long: give them an in-page table of contents. */
  showToc?: boolean;
};

/** One policy document: header, optional table of contents, sections and contact footer. */
export function PolicyArticle({ doc, copy, eyebrow, lastUpdated, showBackLink = true, showToc = false }: Props) {
  return (
    <article aria-labelledby="policy-title">
      <header className="mb-10 border-b border-line pb-8">
        <p className="eyebrow mb-5">{eyebrow}</p>
        <h1 id="policy-title" className="font-display text-step-3xl font-light leading-[1.05]">
          {doc.title}
        </h1>
        <p className="lede mt-5 max-w-[60ch]">{doc.summary}</p>
        <p className="mono-label mt-6 text-ink-3">
          {copy.lastUpdated} <time dateTime={lastUpdated}>{lastUpdated}</time>
        </p>
      </header>

      {showToc && (
        <nav aria-labelledby="policy-toc" className="surface-panel mb-12 p-5 sm:p-6">
          <h2 id="policy-toc" className="mono-label mb-4 text-ink-3">
            {copy.onThisPage}
          </h2>
          <ol className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {doc.sections.map((section, i) => (
              <li key={i}>
                <a
                  href={`#section-${i + 1}`}
                  className="inline-flex min-h-[36px] items-center text-step-sm text-ink-2 underline-offset-4 hover:text-foreground hover:underline"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="space-y-12">
        {doc.sections.map((section, i) => (
          <section key={i} id={`section-${i + 1}`} aria-labelledby={`section-${i + 1}-title`} className="scroll-mt-28">
            <h2 id={`section-${i + 1}-title`} className="mb-4 font-display text-step-xl font-normal">
              {section.heading}
            </h2>
            <PolicyContent content={section.content} />
          </section>
        ))}
      </div>

      <footer className="mt-16 flex flex-col gap-4 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-step-sm text-ink-3">{copy.questions}</p>
        {showBackLink && (
          <Link href="/policies" className="link-arrow self-start text-step-sm">
            <span aria-hidden>←</span>
            {copy.backToOverview}
          </Link>
        )}
      </footer>
    </article>
  );
}
