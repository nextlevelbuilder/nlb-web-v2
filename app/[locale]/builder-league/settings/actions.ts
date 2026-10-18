"use server";

import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { getDb } from "@/lib/db";
import { updatePrivacy, type PrivacyPatch } from "@/lib/builder-league/privacy";
import { getBuilderPageViewer } from "@/components/builder-league/home/page-access";

const SWITCHES = ["leaderboardPublic", "passportPublic", "wrappedPublic", "peerMentionsOk", "backfillOptIn", "redactFinancials"] as const;

/**
 * Saves the privacy form. Every checkbox is posted with the form, so an unchecked box turns its
 * surface off. The session and league access are re-checked here: a server action is a public endpoint.
 */
export async function savePrivacySettings(formData: FormData): Promise<void> {
  const { user, access } = await getBuilderPageViewer();
  if (!user || !access.canUse) notFound();
  const patch: PrivacyPatch = {};
  for (const key of SWITCHES) patch[key] = formData.get(key) === "on";
  await updatePrivacy(getDb(), user.id, patch);
  const locale = formData.get("locale");
  redirect({ href: { pathname: "/builder-league/settings", query: { saved: "1" } }, locale: isLocale(locale) ? locale : "en" });
}
