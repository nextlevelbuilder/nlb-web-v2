// Redirects ui-ux-pro-max-skill.nextlevelbuilder.io to uupm.cc with a permanent 301.
// Paths that exist on uupm.cc keep their path and query string. Every other path goes to the uupm.cc home page.
// This is the logic of the `ui-ux-pro-max-skill-redirect` worker as deployed on the old Cloudflare account.
// Only the named default export (for lint) differs.

const VALID_PREFIXES = [
  "/demo/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/account",
  "/profile",
  "/api-keys",
  "/privacy",
  "/terms",
  "/api/",
  "/staging-access",
  "/icon.svg",
  "/robots.txt",
  "/sitemap.xml",
];

const redirectWorker = {
  async fetch(request) {
    const url = new URL(request.url);
    url.protocol = "https:";
    url.hostname = "uupm.cc";
    url.port = "";

    const path = url.pathname.toLowerCase();
    const isValid = path === "/" || VALID_PREFIXES.some((p) => path.startsWith(p));
    if (!isValid) {
      url.pathname = "/";
    }

    return Response.redirect(url.toString(), 301);
  },
};

export default redirectWorker;
