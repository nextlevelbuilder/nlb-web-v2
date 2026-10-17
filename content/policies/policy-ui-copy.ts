import type { PolicyLocale } from "./policy-types";

/** Interface strings for the policy pages (kept here so messages/*.json stay untouched). */
export type PolicyUiCopy = {
  title: string;
  subtitle: string;
  eyebrow: string;
  navLabel: string;
  communityGroup: string;
  legalGroup: string;
  lastUpdated: string;
  backToOverview: string;
  onThisPage: string;
  allPolicies: string;
  questions: string;
};

export const policyUiCopy: Record<PolicyLocale, PolicyUiCopy> = {
  en: {
    title: "Policies & Guidelines",
    subtitle: "Community guidelines and the legal terms of Next Level Builders.",
    eyebrow: "Policies",
    navLabel: "Policy navigation",
    communityGroup: "Community",
    legalGroup: "Legal",
    lastUpdated: "Last updated",
    backToOverview: "Back to overview",
    onThisPage: "On this page",
    allPolicies: "All policies",
    questions: "Questions about a policy? Email hello@nextlevelbuilder.io.",
  },
  vi: {
    title: "Chính sách & Quy chế",
    subtitle: "Quy chế cộng đồng và các điều khoản pháp lý của Next Level Builders.",
    eyebrow: "Chính sách",
    navLabel: "Điều hướng chính sách",
    communityGroup: "Cộng đồng",
    legalGroup: "Pháp lý",
    lastUpdated: "Cập nhật lần cuối",
    backToOverview: "Quay lại tổng quan",
    onThisPage: "Trong trang này",
    allPolicies: "Tất cả chính sách",
    questions: "Có câu hỏi về chính sách? Gửi email tới hello@nextlevelbuilder.io.",
  },
};
