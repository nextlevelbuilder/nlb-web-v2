'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { StudioToolState } from '@/lib/webmcp/studio-tools';
import { connectStudioTools } from '@/lib/webmcp/studio-connection';

export default function StudioAgentConnect(props: StudioToolState) {
  const state = useRef(props);
  // Keep the latest callbacks for the long-lived WebMCP connection without reconnecting on every render.
  useEffect(() => {
    state.current = props;
  });
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!enabled) return;
    return connectStudioTools({
      getDocument: () => state.current.getDocument(),
      replaceDocument: (document) => state.current.replaceDocument(document),
      preview: () => state.current.preview(),
    }, () => setStatus('Widget ready. Paste your WebMCP token into the WebMCP widget to connect.'),
    () => setStatus('Unable to load WebMCP. Disable and try again.'));
  }, [enabled]);
  return (
    <section className="space-y-3 rounded-sm border border-line-strong bg-surface-raised p-4" aria-labelledby="studio-agent-connect-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 id="studio-agent-connect-title" className="font-display text-step-lg">Design with your AI</h3>
          <p className="text-step-sm text-ink-2">Connect WebMCP to let your assistant inspect, edit and preview this draft. Review the result here before saving or submitting.</p>
        </div>
        <Button type="button" variant="outline" aria-pressed={enabled} onClick={() => { const next = !enabled; setEnabled(next); setStatus(next ? 'Loading WebMCP…' : ''); }}>
          {enabled ? 'Disable WebMCP' : 'Enable WebMCP'}
        </Button>
      </div>
      {enabled && <p className="text-step-xs text-ink-2">Configure your MCP client with <code>npx -y @jason.today/webmcp@0.1.13 --mcp</code>, then ask it to generate a connection token. Keep this Studio tab open. <a className="text-primary underline underline-offset-4" href="https://webmcp.dev/" target="_blank" rel="noopener noreferrer">Connection guide<span className="sr-only"> (opens in a new tab)</span></a></p>}
      <p role="status" className="text-step-xs text-ink-2">{status}</p>
    </section>
  );
}
