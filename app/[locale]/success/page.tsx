import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Link as LocaleLink } from "@/i18n/navigation";
import { toPageLocale } from "@/content/pages/page-locale";
import { successPageCopy } from "@/content/pages/success-page-copy";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { title: successPageCopy[toPageLocale(locale)].metaTitle, robots: { index: false, follow: false } };
}

export default async function SuccessPage({ params }: Props) {
  const { locale } = await params;
  const copy = successPageCopy[toPageLocale(locale)];
  return (
    <main id="main" className="sky-backdrop flex min-h-screen items-center justify-center bg-background px-4 py-16 text-foreground">
      <div className="surface-panel w-full max-w-2xl space-y-8 p-6 shadow-constellation sm:p-10">
        <header className="space-y-4 text-center">
          <CheckCircle2 aria-hidden className="mx-auto h-14 w-14 text-primary" strokeWidth={1.25} />
          <p className="eyebrow justify-center">{copy.eyebrow}</p>
          <h1 className="font-display text-step-2xl font-light">{copy.title}</h1>
          <p className="lede mx-auto">{copy.lede}</p>
        </header>

        <section aria-labelledby="next-steps" className="border-t border-line pt-6">
          <h2 id="next-steps" className="mono-label mb-4 text-ink-3">
            {copy.nextStepsTitle}
          </h2>
          <ol className="space-y-3">
            {copy.nextSteps.map((step, i) => (
              <li key={step} className="grid grid-cols-[2rem_1fr] gap-3 text-step-base text-ink-2">
                <span aria-hidden className="font-display text-step-lg italic leading-none text-primary">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="flex-1">
            <Link href="https://discord.com/invite/Ht4sb7Wjnx">{copy.joinDiscord}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="flex-1">
            <LocaleLink href="/">{copy.backHome}</LocaleLink>
          </Button>
        </div>

        <p className="text-center text-step-sm text-ink-3">
          {copy.troublePrefix}{" "}
          <a href="mailto:hello@nextlevelbuilder.io" className="text-foreground underline underline-offset-4">
            hello@nextlevelbuilder.io
          </a>
        </p>
      </div>
    </main>
  );
}
