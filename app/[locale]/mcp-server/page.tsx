import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ChapterPlate from "@/components/constellation/chapter-plate";
import TerminalCopyButton from "@/components/constellation/terminal-copy-button";
import { mcpServerCopy, type McpClientId, type McpToolGroupId } from "@/content/pages/mcp-server-copy";
import { toPageLocale } from "@/content/pages/page-locale";
import { TOOLKIT_MCP } from "@/lib/constants/home-content";
import { DISCOVERY_PATHS } from "@/lib/discovery/discovery-link-header";
import { pageMetadata } from "@/lib/seo";
import { GUIDE_ANCHOR } from "../build-with-us/build-with-us-guide";
import "./mcp-server.css";

type Props = { params: Promise<{ locale: string }> };

const PLATE_COORD = "Vega · RA 18h 37m · Dec +38° 47′";
const REPOSITORY_URL = "https://github.com/nextlevelbuilder/nlb-web-v2/tree/main/packages/mcp";

/** Local stdio server for scripts, CI and clients without OAuth; the key placeholder is never a real key. */
const LOCAL_CONFIG = JSON.stringify(
  { mcpServers: { "nlb-directory": { command: "npx", args: ["-y", "@nextlevelbuilder/mcp"], env: { NLB_API_KEY: "nlb_live_…" } } } },
  null,
  2,
);

const CLIENT_SNIPPETS: Record<McpClientId, { code: string; prompt?: boolean }> = {
  claudeCode: { code: TOOLKIT_MCP.claudeCode, prompt: true },
  claudeApp: { code: TOOLKIT_MCP.endpoint },
  configFile: { code: TOOLKIT_MCP.clientConfig },
  local: { code: LOCAL_CONFIG },
};

/** Tool names per group, as the server registers them (packages/mcp/src/tools). */
const TOOL_GROUPS: Array<[McpToolGroupId, string[]]> = [
  ["directory", ["list_products", "get_product", "get_product_markdown", "get_leaderboard", "get_stats", "list_templates", "validate_listing", "check_health"]],
  ["launch", ["submit_product", "upload_media", "cast_vote", "create_checkout"]],
  ["traffic", ["get_product_traffic"]],
  ["keys", ["list_api_keys", "create_api_key", "revoke_api_key"]],
  ["membership", ["onboarding_get_status"]],
  ["admin", ["blog_*", "course_*"]],
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const copy = mcpServerCopy[toPageLocale(locale)];
  return pageMetadata({ title: copy.metaTitle, description: copy.metaDescription, path: "/mcp-server", locale });
}

/** Introduction to the official remote MCP server served at /mcp: endpoint, client setup, sign-in, tools. */
export default async function McpServerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const copy = mcpServerCopy[toPageLocale(locale)];

  return (
    <main id="main" className="mcp-page">
      <div className="wrap">
        <header className="page-head mcp-head">
          <ChapterPlate numeral="VII" name={copy.plate} coord={PLATE_COORD} />
          <h1 className="h1-page">
            {copy.headingLead}<em>{copy.headingAccent}</em>
          </h1>
          <p className="lede">{copy.lede}</p>
          <div className="surface term mcp-endpoint">
            <div className="term-mcp">
              <span><span className="mono mcp-k">{copy.endpointLabel}</span><code>{TOOLKIT_MCP.endpoint}</code></span>
              <TerminalCopyButton text={TOOLKIT_MCP.endpoint} label={copy.copyEndpoint} />
            </div>
          </div>
          <div className="mcp-ctas">
            <a className="btn btn-primary" href="#connect">{copy.connectCta}<span className="arrow" aria-hidden="true">→</span></a>
            <a className="btn btn-ghost" href="#tools">{copy.toolsCta}</a>
          </div>
          <ul className="mcp-facts mono">
            {copy.facts.map((fact) => <li key={fact}><span className="mcp-star" aria-hidden="true">✦</span>{fact}</li>)}
          </ul>
        </header>

        <section className="mcp-section" id="connect" aria-labelledby="connect-title">
          <h2 id="connect-title" className="h2 mcp-h2">{copy.connectTitle}</h2>
          <p className="lede mcp-intro">{copy.connectIntro}</p>
          <ol className="mcp-clients">
            {(Object.keys(CLIENT_SNIPPETS) as McpClientId[]).map((id) => {
              const client = copy.clients[id];
              const snippet = CLIENT_SNIPPETS[id];
              return (
                <li key={id} className="surface term mcp-client">
                  <div className="term-bar">
                    <h3 className="mono mcp-client-name">{client.name}</h3>
                    <TerminalCopyButton text={snippet.code} label={client.copyLabel} />
                  </div>
                  <div className="mcp-client-body">
                    <p>{client.note}</p>
                    {id === "claudeApp" && (
                      <ol className="mcp-steps">
                        {copy.claudeAppSteps.map((step) => <li key={step}>{step}</li>)}
                      </ol>
                    )}
                  </div>
                  <pre><code>
                    {snippet.code.split("\n").map((line, i) => (
                      <span className="ln" key={i}>{snippet.prompt && <span className="p">$ </span>}{line}</span>
                    ))}
                  </code></pre>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mcp-section" id="auth" aria-labelledby="auth-title">
          <h2 id="auth-title" className="h2 mcp-h2">{copy.authTitle}</h2>
          <p className="lede mcp-intro">{copy.authIntro}</p>
          <dl className="mcp-scopes">
            {copy.scopes.map(({ scope, desc }) => (
              <div key={scope} className="surface mcp-scope">
                <dt><code>{scope}</code></dt>
                <dd>{desc}</dd>
              </div>
            ))}
          </dl>
          <ul className="mcp-notes">
            {copy.authNotes.map((note) => <li key={note}>{note}</li>)}
          </ul>
          <Link className="link-arrow" href="/account">{copy.manageAccess} <span aria-hidden="true">→</span></Link>
        </section>

        <section className="mcp-section" id="tools" aria-labelledby="tools-title">
          <h2 id="tools-title" className="h2 mcp-h2">{copy.toolsTitle}</h2>
          <p className="lede mcp-intro">{copy.toolsIntro}</p>
          <ul className="mcp-groups">
            {TOOL_GROUPS.map(([id, tools]) => {
              const group = copy.toolGroups[id];
              return (
                <li key={id} className="surface mcp-group">
                  <div className="mcp-group-head">
                    <h3>{group.title}</h3>
                    <span className="mono mcp-access">{group.access}</span>
                  </div>
                  <p>{group.desc}</p>
                  <ul className="mcp-tool-names" aria-label={group.title}>
                    {tools.map((tool) => <li key={tool}><code>{tool}</code></li>)}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mcp-section" aria-labelledby="prompts-title">
          <h2 id="prompts-title" className="h2 mcp-h2">{copy.promptsTitle}</h2>
          <ul className="mcp-prompts">
            {copy.prompts.map((prompt) => <li key={prompt} className="surface"><q>{prompt}</q></li>)}
          </ul>
        </section>

        <section className="mcp-section" aria-labelledby="resources-title">
          <h2 id="resources-title" className="h2 mcp-h2">{copy.resourcesTitle}</h2>
          <nav className="mcp-resources" aria-labelledby="resources-title">
            <a className="link-arrow" href={DISCOVERY_PATHS.serverCard}>{copy.resources.serverCard} <span aria-hidden="true">→</span></a>
            <a className="link-arrow" href={DISCOVERY_PATHS.apiDocs}>{copy.resources.apiDocs} <span aria-hidden="true">→</span></a>
            <a className="link-arrow" href={DISCOVERY_PATHS.openApi}>{copy.resources.openApi} <span aria-hidden="true">→</span></a>
            <a className="link-arrow" href={DISCOVERY_PATHS.llms}>{copy.resources.llms} <span aria-hidden="true">→</span></a>
            <Link className="link-arrow" href={{ pathname: "/build-with-us", hash: GUIDE_ANCHOR }}>{copy.resources.guide} <span aria-hidden="true">→</span></Link>
            <a className="link-arrow" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
              {copy.resources.repository} <span aria-hidden="true">↗</span><span className="sr-only"> {copy.newTab}</span>
            </a>
          </nav>
        </section>
      </div>
    </main>
  );
}
