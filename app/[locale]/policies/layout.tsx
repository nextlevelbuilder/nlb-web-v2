import PolicySidebar from '@/components/policy-sidebar';
import { publishedPolicySlugs } from '@/lib/policies/published-policies';

export default function PoliciesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex-1">
        <div className="wrap pb-section-sm pt-[calc(var(--header-h)+3rem)] md:pt-[calc(var(--header-h)+4.5rem)]">
          <div className="flex flex-col gap-8 md:flex-row md:gap-12 lg:gap-16">
            <PolicySidebar published={publishedPolicySlugs()} />
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
