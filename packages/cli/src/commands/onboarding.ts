import { Command } from "commander";
import pc from "picocolors";
import type { OnboardingStatus } from "@nextlevelbuilder/contracts";
import { resolveConfig } from "../config.js";
import { NlbOnboardingClient, OnboardingApiError } from "../api/onboarding-client.js";
import { sanitizeTerminalText as safe } from "../preview/ascii.js";

export interface OnboardingCommandOptions {
  apiKey?: string;
  url?: string;
  json?: boolean;
}

export interface OnboardingCommandDeps {
  fetchFn?: typeof fetch;
}

function renderStatus(status: OnboardingStatus): void {
  const m = status.membership;
  console.log(pc.cyan("\nMembership onboarding"));
  console.log(`  payment:    ${status.payment}`);
  console.log(`  membership: ${m ? `${safe(m.plan)} (${m.tier}${m.term ? `, ${m.term}` : ""}) ${safe(m.status)}${m.renewsAt ? `, renews ${safe(m.renewsAt)}` : ""}${m.cancelAtPeriodEnd ? ", cancels at period end" : ""}` : "none"}`);
  console.log(`  profile:    ${status.profile.completed ? pc.green("complete") : pc.yellow("incomplete")}`);
  for (const [name, c] of Object.entries(status.connections) as Array<[string, OnboardingStatus["connections"]["discord"]]>) {
    const next = c.nextAction === "none" ? "" : pc.yellow(` (next: ${c.nextAction})`);
    console.log(`  ${name.padEnd(10)}  ${c.status}${c.displayName ? ` as ${safe(c.displayName)}` : ""}${next}`);
  }
  console.log("");
}

export async function onboardingStatusCommand(opts: OnboardingCommandOptions, deps: OnboardingCommandDeps = {}): Promise<void> {
  try {
    const config = resolveConfig({ apiKey: opts.apiKey, url: opts.url });
    const client = new NlbOnboardingClient({ baseUrl: config.apiUrl, apiKey: config.apiKey, fetchFn: deps.fetchFn });
    const result = await client.getStatus();
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else renderStatus(result.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      const payload: Record<string, unknown> = { success: false, error: message };
      if (err instanceof OnboardingApiError) {
        payload.status = err.status;
        payload.notEnabled = err.notEnabled;
        if (err.code) payload.code = err.code;
      }
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error(pc.red(`✖ ${safe(message)}`));
    }
    process.exitCode = 1;
  }
}

export function registerOnboardingCommands(program: Command, deps: OnboardingCommandDeps = {}): Command {
  const onboarding = program.command("onboarding").description("Membership onboarding (payment, profile, Discord and Telegram access)");
  onboarding
    .command("status")
    .description("Show your membership onboarding progress")
    .option("-k, --api-key <key>", "Member API key (or NLB_API_KEY)")
    .option("-u, --url <url>", "Directory API base URL")
    .option("--json", "Output the API response (or error) as JSON")
    .action(async (opts: OnboardingCommandOptions) => {
      await onboardingStatusCommand(opts, deps);
    });
  return onboarding;
}
