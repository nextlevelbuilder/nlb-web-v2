import { SENSITIVE_OPERATOR_ACTIONS, type OperatorDomain, type SensitiveOperatorAction } from "@/lib/access/types";

/**
 * Domain whose `<domain>:manage` capability guards each sensitive action. Granting or revoking operator
 * capabilities is platform administration, so it needs `system:manage`.
 */
const SENSITIVE_ACTION_DOMAIN: Record<SensitiveOperatorAction, OperatorDomain> = {
  "live.ticket.refund": "live",
  "live.event.cancel": "live",
  "live.poll.override": "live",
  "affiliate.payout.approve": "affiliate",
  "affiliate.ledger.adjust": "affiliate",
  "affiliate.rules.publish": "affiliate",
  "operator.grant": "system",
  "operator.revoke": "system",
};

export function isSensitiveOperatorAction(action: string): action is SensitiveOperatorAction {
  return (SENSITIVE_OPERATOR_ACTIONS as readonly string[]).includes(action);
}

export function sensitiveActionDomain(action: SensitiveOperatorAction): OperatorDomain {
  return SENSITIVE_ACTION_DOMAIN[action];
}
