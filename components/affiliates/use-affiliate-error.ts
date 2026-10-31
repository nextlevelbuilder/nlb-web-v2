"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { AffiliateApiError, errorKey } from "./affiliate-api";

/** Localized message for a failed affiliate API call; validation details from the server are appended. */
export function useAffiliateErrorMessage(): (error: unknown) => string {
  const t = useTranslations("affiliateAccount.errors");
  return useCallback(
    (error: unknown) => {
      const key = errorKey(error);
      if (key === "invalid_input") return t("invalid_input", { detail: error instanceof AffiliateApiError ? error.message : "" });
      return t(key);
    },
    [t]
  );
}
