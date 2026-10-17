import { Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, getPathname } from "@/i18n/navigation";
import { getHomeCopy } from "@/content/builder-league/home-copy";
import type { BuilderPageViewer } from "./page-access";

/** Sign-in or membership panel for a member page the viewer cannot use yet; null when they can. */
export function BuilderAccessPanel({ viewer, locale, path }: { viewer: BuilderPageViewer; locale: string; path: string }) {
  if (viewer.access.canUse) return null;
  const copy = getHomeCopy(locale);
  const signedOut = !viewer.user;
  const panel = signedOut ? copy.signIn : copy.membership;
  const Icon = signedOut ? LogIn : Lock;
  return (
    <section className="surface-panel space-y-4 px-6 py-12 text-center">
      <Icon aria-hidden className="mx-auto h-9 w-9 text-ink-3" strokeWidth={1.25} />
      <h2 className="font-display text-step-xl font-normal">{panel.title}</h2>
      <p className="mx-auto max-w-[52ch] text-step-sm text-ink-2">{panel.desc}</p>
      <Button asChild>
        <Link href={signedOut ? { pathname: "/sign-in", query: { callbackUrl: getPathname({ href: path, locale }) } } : { pathname: "/", hash: "pricing" }}>
          {panel.cta}
        </Link>
      </Button>
    </section>
  );
}
