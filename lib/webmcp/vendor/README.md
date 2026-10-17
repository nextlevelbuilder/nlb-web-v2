# WebMCP browser widget
Source: @jason.today/webmcp 0.1.13, src/webmcp.js from the npm package.
Upstream: https://github.com/jasonjmcghee/WebMCP (MIT, see LICENSE).
Locally bundled, dynamically imported only after Studio opt-in. No remote script or npm server runtime is loaded.

Local changes: ESM default export; destroy() removes the widget, activity listeners, inactivity timer and registries; tracks/closes all registration and channel sockets; connection generation prevents a pending registration from reconnecting after disconnect; ignores post-disconnect messages and stale lifecycle callbacks; declines unused sampling requests; removes logging of tool arguments; uses a keyboard-accessible widget trigger button. Keep these fixes when updating upstream.
