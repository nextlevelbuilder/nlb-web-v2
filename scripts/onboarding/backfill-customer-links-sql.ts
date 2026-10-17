/**
 * SQL for linking existing Polar customers to NLB users, shared by the backfill CLI and its test.
 *
 * Same rule as `findLinkableCustomerForUser`: the user's email is verified and equals the customer
 * email after trim + lowercase. A customer matched by more than one user (ambiguous) or already
 * linked is skipped. One user may own several customers, so every unambiguous match is linked.
 * Linking grants nothing by itself: community access changes only after the member connects
 * Discord or Telegram through NLB.
 */

export const LINK_CANDIDATES_SQL = `
WITH matches AS (
  SELECT c.id AS customer_id, u.id AS user_id
  FROM customers c
  JOIN users u ON lower(trim(u.email)) = lower(trim(c.email)) AND u.email_verified = 1
  WHERE c.user_id IS NULL
)
SELECT m.customer_id, m.user_id
FROM matches m
WHERE (SELECT count(*) FROM matches x WHERE x.customer_id = m.customer_id) = 1
ORDER BY m.customer_id`;

export const LINK_SUMMARY_SQL = `
SELECT
  (SELECT count(*) FROM customers) AS customers,
  (SELECT count(*) FROM customers WHERE user_id IS NOT NULL) AS already_linked,
  (SELECT count(*) FROM customers c WHERE c.user_id IS NULL AND NOT EXISTS (
     SELECT 1 FROM users u WHERE lower(trim(u.email)) = lower(trim(c.email)) AND u.email_verified = 1
   )) AS no_verified_user`;

export interface LinkCandidate {
  customer_id: string;
  user_id: string;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function quote(value: string): string {
  if (!SAFE_ID.test(value)) throw new Error("Unexpected id format in link candidate");
  return `'${value}'`;
}

/** One guarded UPDATE per pair: never overwrites an existing link. */
export function linkStatements(candidates: LinkCandidate[], nowMs: number): string[] {
  return candidates.map(
    ({ customer_id, user_id }) =>
      `UPDATE customers SET user_id = ${quote(user_id)}, updated_at = ${nowMs} ` +
      `WHERE id = ${quote(customer_id)} AND user_id IS NULL;`
  );
}
