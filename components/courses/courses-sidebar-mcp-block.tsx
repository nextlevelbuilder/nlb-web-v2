import Link from "next/link";
import type { CoursesCopy } from "@/lib/courses/courses-copy";
import { MCP_ENDPOINT } from "@/lib/discovery/agent-discovery-documents";
import { localizedPath } from "@/lib/seo";

/** Sidebar block: how members read course transcripts through the NLB MCP server. */
export function CoursesSidebarMcpBlock({ copy, locale }: { copy: CoursesCopy; locale: string }) {
  return (
    <section className="surface courses-aside-block courses-mcp" aria-labelledby="courses-aside-mcp">
      <p className="mono courses-kicker">{copy.mcpKicker}</p>
      <h2 id="courses-aside-mcp" className="courses-aside-title">{copy.mcpHeading}</h2>
      <p className="courses-mcp-body">{copy.mcpBody}</p>
      <ol className="courses-mcp-steps">
        {copy.mcpSteps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <dl className="courses-mcp-facts">
        <div>
          <dt className="mono">{copy.mcpEndpointLabel}</dt>
          <dd><code>{MCP_ENDPOINT}</code></dd>
        </div>
        <div>
          <dt className="mono">{copy.mcpTools}</dt>
          <dd><code>course_list_videos</code> <code>course_get_transcript</code></dd>
        </div>
        <div>
          <dt className="mono">{copy.mcpPromptLabel}</dt>
          <dd className="courses-mcp-prompt">“{copy.mcpPrompt}”</dd>
        </div>
      </dl>
      <p className="courses-mcp-who">{copy.mcpWho}</p>
      <div className="courses-mcp-links">
        <Link className="link-arrow" href={`${localizedPath("/build-with-us", locale)}#agent-resources`}>{copy.mcpGuide} <span aria-hidden="true">→</span></Link>
        <Link className="link-arrow" href={`${localizedPath("/", locale)}#pricing`}>{copy.mcpJoin} <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  );
}
