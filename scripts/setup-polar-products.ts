#!/usr/bin/env bun

/**
 * Script to create/update Polar.sh products for Next Level Builders
 *
 * Usage:
 *   bun scripts/setup-polar-products.ts
 *
 * This script creates 6 products for 2 packages (Premium & VIP):
 * - Premium EarlyBird Annual: $228/year ($19/month)
 * - Premium Quarterly: $147/quarter ($49/month)
 * - Premium Annual: $468/year ($39/month)
 * - VIP EarlyBird Annual: $468/year ($39/month)
 * - VIP Quarterly: $297/quarter ($99/month)
 * - VIP Annual: $948/year ($79/month)
 */

import { Polar } from "@polar-sh/sdk";

// Bun automatically loads .env file

// Initialize Polar SDK
const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
});

const ORG_ID = process.env.POLAR_ORG_ID || "7caca1d7-7ad3-4126-9ee5-e7f51eae44cf";

interface ProductConfig {
  name: string;
  description: string;
  priceAmount: number;
  priceCurrency: "usd";
  recurringInterval: "month" | "year";
  recurringIntervalCount?: number;
}

// Product configurations
const PRODUCTS: Record<string, ProductConfig> = {
  PREMIUM_EARLYBIRD_ANNUAL: {
    name: "Premium - EarlyBird 2025 (Annual)",
    description: "Self-paced Builder package with a 52-week recorded session library plus new weekly drops, private Discord community, eLearning video treasury, premium Discord channels for launch support, and async written feedback from founders in Discord. Limited to 30 slots. Billed annually at $228/year ($19/month).",
    priceAmount: 22800, // $228.00 in cents
    priceCurrency: "usd",
    recurringInterval: "year",
  },
  PREMIUM_QUARTERLY: {
    name: "Premium - Quarterly",
    description: "Self-paced Builder package with a 52-week recorded session library plus new weekly drops, private Discord community, eLearning video treasury, premium Discord channels for launch support, and async written feedback from founders in Discord. Limited to 30 slots. Billed every 3 months at $147/quarter ($49/month).",
    priceAmount: 14700, // $147.00 in cents ($49/month x 3)
    priceCurrency: "usd",
    recurringInterval: "month",
    recurringIntervalCount: 3,
  },
  PREMIUM_ANNUAL: {
    name: "Premium - Annual",
    description: "Self-paced Builder package with a 52-week recorded session library plus new weekly drops, private Discord community, eLearning video treasury, premium Discord channels for launch support, and async written feedback from founders in Discord. Limited to 30 slots. Billed annually at $468/year ($39/month).",
    priceAmount: 46800, // $468.00 in cents ($39/month x 12)
    priceCurrency: "usd",
    recurringInterval: "year",
  },
  VIP_EARLYBIRD_ANNUAL: {
    name: "VIP - EarlyBird 2025 (Annual)",
    description: "Guided Builder package with everything in Premium PLUS VIP channel for priority questions, early access to tools & content, 1 article promoting your product, and the VIP template + AI prompt vault. Limited to 10 slots. Billed annually at $468/year ($39/month).",
    priceAmount: 46800, // $468.00 in cents
    priceCurrency: "usd",
    recurringInterval: "year",
  },
  VIP_QUARTERLY: {
    name: "VIP - Quarterly",
    description: "Guided Builder package with everything in Premium PLUS VIP channel for priority questions, early access to tools & content, 1 article promoting your product, and the VIP template + AI prompt vault. Limited to 10 slots. Billed every 3 months at $297/quarter ($99/month).",
    priceAmount: 29700, // $297.00 in cents ($99/month x 3)
    priceCurrency: "usd",
    recurringInterval: "month",
    recurringIntervalCount: 3,
  },
  VIP_ANNUAL: {
    name: "VIP - Annual",
    description: "Guided Builder package with everything in Premium PLUS VIP channel for priority questions, early access to tools & content, 1 article promoting your product, and the VIP template + AI prompt vault. Limited to 10 slots. Billed annually at $948/year ($79/month).",
    priceAmount: 94800, // $948.00 in cents ($79/month x 12)
    priceCurrency: "usd",
    recurringInterval: "year",
  },
};

async function createProduct(key: string, config: ProductConfig) {
  console.log(`\n📦 Creating product: ${config.name}`);
  console.log(`   Price: $${config.priceAmount / 100} ${config.priceCurrency}/${config.recurringInterval}`);

  try {
    const product = await polar.products.create({
      name: config.name,
      description: config.description,
      recurringInterval: config.recurringInterval,
      ...(config.recurringIntervalCount ? { recurringIntervalCount: config.recurringIntervalCount } : {}),
      prices: [
        {
          amountType: "fixed",
          priceAmount: config.priceAmount,
          priceCurrency: config.priceCurrency,
        },
      ],
      medias: [],
    });

    console.log(`   ✅ Created successfully!`);
    console.log(`   Product ID: ${product.id}`);
    console.log(`   ${key}="${product.id}"`);

    return product;
  } catch (error) {
    console.error(`   ❌ Failed to create product: ${error}`);
    throw error;
  }
}

async function main() {
  console.log("🚀 Starting Polar product setup for Next Level Builders\n");
  console.log(`Organization ID: ${ORG_ID}`);

  if (!process.env.POLAR_ACCESS_TOKEN) {
    console.error("❌ POLAR_ACCESS_TOKEN is not set in environment variables");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Creating Products...");
  console.log("=".repeat(60));

  const createdProducts: Record<string, string> = {};

  // Create all products
  for (const [key, config] of Object.entries(PRODUCTS)) {
    try {
      const product = await createProduct(key, config);
      createdProducts[key] = product.id;
    } catch (error) {
      console.error(`Failed to create ${key}:`, error);
      // Continue with other products
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Product Setup Complete!");
  console.log("=".repeat(60));

  console.log("\n📝 Add these to your .env file:\n");
  console.log("# Premium Package Product IDs");
  if (createdProducts.PREMIUM_EARLYBIRD_ANNUAL) {
    console.log(`POLAR_PRODUCT_PREMIUM_EARLYBIRD_ANNUAL="${createdProducts.PREMIUM_EARLYBIRD_ANNUAL}"`);
    console.log(`NEXT_PUBLIC_POLAR_PRODUCT_PREMIUM_EARLYBIRD_ANNUAL="${createdProducts.PREMIUM_EARLYBIRD_ANNUAL}"`);
  }
  if (createdProducts.PREMIUM_QUARTERLY) {
    console.log(`POLAR_PRODUCT_PREMIUM_QUARTERLY="${createdProducts.PREMIUM_QUARTERLY}"`);
    console.log(`NEXT_PUBLIC_POLAR_PRODUCT_PREMIUM_QUARTERLY="${createdProducts.PREMIUM_QUARTERLY}"`);
  }
  if (createdProducts.PREMIUM_ANNUAL) {
    console.log(`POLAR_PRODUCT_PREMIUM_ANNUAL="${createdProducts.PREMIUM_ANNUAL}"`);
    console.log(`NEXT_PUBLIC_POLAR_PRODUCT_PREMIUM_ANNUAL="${createdProducts.PREMIUM_ANNUAL}"`);
  }

  console.log("\n# VIP Package Product IDs");
  if (createdProducts.VIP_EARLYBIRD_ANNUAL) {
    console.log(`POLAR_PRODUCT_VIP_EARLYBIRD_ANNUAL="${createdProducts.VIP_EARLYBIRD_ANNUAL}"`);
    console.log(`NEXT_PUBLIC_POLAR_PRODUCT_VIP_EARLYBIRD_ANNUAL="${createdProducts.VIP_EARLYBIRD_ANNUAL}"`);
  }
  if (createdProducts.VIP_QUARTERLY) {
    console.log(`POLAR_PRODUCT_VIP_QUARTERLY="${createdProducts.VIP_QUARTERLY}"`);
    console.log(`NEXT_PUBLIC_POLAR_PRODUCT_VIP_QUARTERLY="${createdProducts.VIP_QUARTERLY}"`);
  }
  if (createdProducts.VIP_ANNUAL) {
    console.log(`POLAR_PRODUCT_VIP_ANNUAL="${createdProducts.VIP_ANNUAL}"`);
    console.log(`NEXT_PUBLIC_POLAR_PRODUCT_VIP_ANNUAL="${createdProducts.VIP_ANNUAL}"`);
  }

  console.log("\n⚠️  Remember to:");
  console.log("   1. Update .env with the product IDs above");
  console.log("   2. Update .env.example with placeholder values");
  console.log("   3. Update Vercel environment variables");
  console.log("   4. Restart your development server");
}

// Run the script
main()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
