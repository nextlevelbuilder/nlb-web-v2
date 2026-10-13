import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { organizationClient, adminClient, emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "https://nextlevelbuilder.io",
  plugins: [
    emailOTPClient(),
    organizationClient(),
    adminClient(),
    oauthProviderClient(),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
export const emailOtp = (authClient as any).emailOtp || (authClient as any).emailOTP;
