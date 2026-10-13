#!/usr/bin/env bun

/**
 * One-time script to rename NLB products on Polar
 * Establishes consistent "NLB - [Tier] Access ([Cycle])" naming convention
 *
 * Usage: bun scripts/rename-polar-products.ts
 */

import { Polar } from "@polar-sh/sdk";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
});

const renames = [
  {
    id: process.env.POLAR_PRODUCT_PREMIUM_QUARTERLY!,
    name: "NLB - Premium Access (Quarterly)",
  },
  {
    id: process.env.POLAR_PRODUCT_PREMIUM_ANNUAL!,
    name: "NLB - Premium Access (Yearly)",
  },
  {
    id: process.env.POLAR_PRODUCT_VIP_QUARTERLY!,
    name: "NLB - VIP Access (Quarterly)",
  },
  {
    id: process.env.POLAR_PRODUCT_VIP_ANNUAL!,
    name: "NLB - VIP Access (Yearly)",
  },
];

async function main() {
  if (!process.env.POLAR_ACCESS_TOKEN) {
    console.error("❌ POLAR_ACCESS_TOKEN not set");
    process.exit(1);
  }

  console.log("🔄 Renaming NLB products on Polar...\n");

  for (const { id, name } of renames) {
    if (!id) {
      console.error(`⚠️  Skipping "${name}" — product ID not set in env`);
      continue;
    }

    try {
      const result = await polar.products.update({
        id,
        productUpdate: { name },
      });
      console.log(`✅ ${result.name} (${id})`);
    } catch (error) {
      console.error(`❌ Failed to rename "${name}" (${id}):`, error);
    }
  }

  console.log("\n✨ Done! Verify on Polar dashboard.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
