import type { ReactNode } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type AccountIdentityHeaderProps = {
  name: string | null | undefined;
  email: string;
  image: string | null | undefined;
  role: string;
  emailVerified: boolean;
  verifiedLabel: string;
  /** Action buttons rendered on the right (public profile, sign out, ...). */
  actions: ReactNode;
};

/** Signed-in identity panel shared by the account and profile dashboards; renders the page h1. */
export default function AccountIdentityHeader({ name, email, image, role, emailVerified, verifiedLabel, actions }: AccountIdentityHeaderProps) {
  return (
    <header className="surface-panel flex flex-col justify-between gap-6 p-6 sm:p-8 md:flex-row md:items-center">
      <div className="flex min-w-0 items-center gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line-strong bg-surface-raised font-display text-step-xl text-primary">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar hosts vary per provider.
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden>{(name || email || "U").charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words font-display text-step-2xl font-light">{name || "Builder"}</h1>
            <Badge variant="outline" className={role === "admin" ? "border-warning/50 text-warning" : undefined}>
              {role}
            </Badge>
            {emailVerified && (
              <Badge variant="outline" className="gap-1 border-success/50 text-success">
                <CheckCircle2 aria-hidden className="h-3 w-3" />
                {verifiedLabel}
              </Badge>
            )}
          </div>
          <p className="flex items-center gap-1.5 break-all font-mono text-step-xs text-ink-2">
            <Mail aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span>{email}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">{actions}</div>
    </header>
  );
}
