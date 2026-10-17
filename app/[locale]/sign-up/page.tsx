import React, { Suspense } from "react";
import AuthForm from "@/components/auth/auth-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign up", robots: { index: false, follow: false } };

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main id="main" className="sky-backdrop flex flex-1 items-center justify-center px-4 pb-20 pt-[calc(var(--header-h)+3rem)] sm:px-6">
        <Suspense fallback={<div role="status" className="text-center text-step-sm text-ink-2">Loading registration...</div>}>
          <AuthForm />
        </Suspense>
      </main>
    </div>
  );
}
