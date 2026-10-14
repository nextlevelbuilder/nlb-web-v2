import { apiCatalogLinkset, discoveryHeaders } from "@/lib/discovery/agent-discovery-documents";

/** RFC 9727 API catalog. */
export function GET() {
  return new Response(JSON.stringify(apiCatalogLinkset(), null, 2), {
    headers: discoveryHeaders('application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8'),
  });
}

/** RFC 9727 requires HEAD to advertise the catalog through a Link header. */
export function HEAD() {
  return new Response(null, {
    headers: {
      ...discoveryHeaders('application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'),
      Link: '</.well-known/api-catalog>; rel="api-catalog"',
    },
  });
}
