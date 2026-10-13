import React, { Suspense } from "react";
import Navbar from "@/components/navbar";
import FooterSection from "@/components/sections/footer-section";
import AuthForm from "@/components/auth/auth-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign up", robots: { index: false, follow: false } };

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <Navbar />

      <div className="flex-1 pt-32 pb-20 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Loading registration...</div>}>
          <AuthForm initialMode="signup" />
        </Suspense>
      </div>

      <FooterSection />
    </div>
  );
}
