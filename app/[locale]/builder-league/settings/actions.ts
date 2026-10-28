"use server";

import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { getDb } from "@/lib/db";
import { getViewerAccess } from "@/lib/builder-league/access";
import { updatePrivacy, type PrivacyPatch } from "@/lib/builder-league/privacy";
import { getBuilderPageViewer } from "@/components/builder-league/home/page-access";
import { handleSelfDeleteForm } from "@/components/builder-league/settings/self-delete-form-handler";

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

/**
 * Deletes the signed-in member's own league data after they typed the confirmation word. The member is
 * taken from the session cookie, never from the form. Pilot members lose league access while the flag is
 * off (their pilot entry is part of the deleted data), so they land on their account page instead.
 */
export async function deleteMyLeagueData(formData: FormData): Promise<void> {
  const { user, access } = await getBuilderPageViewer();
  if (!user || !access.canUse) notFound();
  const rawLocale = formData.get("locale");
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const db = getDb();
  const outcome = await handleSelfDeleteForm(db, { userId: user.id, isAdmin: access.isAdmin }, formData);
  if (!outcome.ok) {
    redirect({ href: `/builder-league/settings?deleteError=${outcome.error}#league-data`, locale });
  }
  const after = await getViewerAccess(db, user);
  if (!after.canUse) redirect({ href: "/account", locale });
  redirect({ href: "/builder-league/settings?deleted=1#league-data", locale });
}
