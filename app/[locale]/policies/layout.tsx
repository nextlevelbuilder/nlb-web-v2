import PolicySidebar from '@/components/policy-sidebar';

export default function PoliciesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-6 py-24">
        <div className="flex gap-10 md:gap-14">
          {/* Sidebar — desktop only; mobile tabs rendered inside PolicySidebar */}
          <PolicySidebar />

          {/* Main content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
