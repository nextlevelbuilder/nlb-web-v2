"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import type { PayeeResidency, PayeeType, PayoutMethodType } from "@/lib/referrals/types";
import { affiliateRequest } from "./affiliate-api";
import { fieldClass, hintClass, labelClass } from "./affiliate-link-form";
import type { AffiliatePayoutMethodView } from "./affiliate-types";
import { useAffiliateErrorMessage } from "./use-affiliate-error";

interface AffiliatePayoutMethodFormProps {
  current: AffiliatePayoutMethodView | null;
  /** Formatted PayPal service fee, e.g. "20%". */
  paypalFee: string;
}

/**
 * Sets the payout method (`PUT /api/v1/affiliates/payout-method`, session only). Stored details are
 * sealed server-side and never sent back, so the form always starts empty and shows only the masked hint.
 */
export default function AffiliatePayoutMethodForm({ current, paypalFee }: AffiliatePayoutMethodFormProps) {
  const t = useTranslations("affiliateAccount.payoutMethod");
  const errorMessage = useAffiliateErrorMessage();
  const router = useRouter();
  const id = useId();
  const [type, setType] = useState<PayoutMethodType>((current?.type as PayoutMethodType) ?? "paypal");
  const [payeeType, setPayeeType] = useState<PayeeType>((current?.payeeType as PayeeType) ?? "individual");
  const [residency, setResidency] = useState<PayeeResidency>((current?.residency as PayeeResidency) ?? "other");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ message: string; error: boolean } | null>(null);

  const chooseType = (next: PayoutMethodType) => {
    setType(next);
    // Vietnamese bank transfers are only for payees resident in Vietnam.
    if (next === "bank_vn") setResidency("vn");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus(null);
    const body =
      type === "paypal"
        ? { type, payeeType, residency, paypalEmail: paypalEmail.trim() }
        : { type, payeeType, residency: "vn", bankName: bankName.trim(), accountHolder: accountHolder.trim(), accountNumber: accountNumber.replace(/\s+/g, "") };
    try {
      await affiliateRequest("/api/v1/affiliates/payout-method", "PUT", body);
      setPaypalEmail("");
      setAccountNumber("");
      setStatus({ message: t("saved"), error: false });
      router.refresh();
    } catch (error) {
      setStatus({ message: errorMessage(error), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <p className="text-step-sm text-ink-2">{current ? t("current", { hint: current.displayHint }) : t("none")}</p>

      <fieldset className="space-y-3">
        <legend className={labelClass}>{t("type")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["paypal", "bank_vn"] as const).map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-sm border p-4 text-step-sm ${type === value ? "border-primary bg-primary/5" : "border-line bg-surface"}`}
            >
              <input type="radio" name={`${id}-type`} value={value} checked={type === value} onChange={() => chooseType(value)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
              <span className="space-y-1">
                <span className="block font-medium text-foreground">{value === "paypal" ? t("paypal") : t("bank")}</span>
                <span className="block text-step-xs text-ink-2">{value === "paypal" ? t("paypalNote", { fee: paypalFee }) : t("bankNote")}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor={`${id}-payee`} className={labelClass}>{t("payeeType")}</label>
          <select id={`${id}-payee`} className={`${fieldClass} mt-2`} value={payeeType} onChange={(e) => setPayeeType(e.target.value === "business" ? "business" : "individual")}>
            <option value="individual">{t("individual")}</option>
            <option value="business">{t("business")}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-residency`} className={labelClass}>{t("residency")}</label>
          <select
            id={`${id}-residency`}
            className={`${fieldClass} mt-2`}
            value={type === "bank_vn" ? "vn" : residency}
            disabled={type === "bank_vn"}
            onChange={(e) => setResidency(e.target.value === "vn" ? "vn" : "other")}
          >
            <option value="vn">{t("residencyVn")}</option>
            <option value="other">{t("residencyOther")}</option>
          </select>
        </div>

        {type === "paypal" ? (
          <div className="md:col-span-2">
            <label htmlFor={`${id}-paypal`} className={labelClass}>{t("paypalEmail")}</label>
            <input
              id={`${id}-paypal`}
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              className={`${fieldClass} mt-2`}
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor={`${id}-bank`} className={labelClass}>{t("bankName")}</label>
              <input id={`${id}-bank`} required maxLength={100} autoComplete="off" className={`${fieldClass} mt-2`} value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-holder`} className={labelClass}>{t("accountHolder")}</label>
              <input id={`${id}-holder`} required maxLength={120} autoComplete="name" className={`${fieldClass} mt-2`} value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-number`} className={labelClass}>{t("accountNumber")}</label>
              <input
                id={`${id}-number`}
                required
                inputMode="numeric"
                autoComplete="off"
                maxLength={24}
                className={`${fieldClass} mt-2 font-mono`}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                aria-describedby={`${id}-number-hint`}
              />
              <p id={`${id}-number-hint`} className={hintClass}>{t("accountNumberHint")}</p>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>{t("save")}</Button>
        {current && <p className="text-step-xs text-ink-3">{t("replaceNote")}</p>}
      </div>
      <p role="status" className={`min-h-0 text-step-sm empty:hidden ${status?.error ? "text-destructive" : "text-success"}`}>
        {status?.message}
      </p>
    </form>
  );
}
