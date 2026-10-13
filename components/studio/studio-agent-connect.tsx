'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { StudioToolState } from '@/lib/webmcp/studio-tools';
import { connectStudioTools } from '@/lib/webmcp/studio-connection';

export default function StudioAgentConnect(props: StudioToolState) {
  const state = useRef(props);
  state.current = props;
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!enabled) return;
    setStatus('Loading WebMCP…');
    return connectStudioTools({
      getDocument: () => state.current.getDocument(),
      replaceDocument: (document) => state.current.replaceDocument(document),
      preview: () => state.current.preview(),
    }, () => setStatus('Widget ready. Paste your WebMCP token into the blue widget to connect.'),
    () => setStatus('Unable to load WebMCP. Disable and try again.'));
  }, [enabled]);
  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3" aria-label="Design with your AI">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">Design with your AI</h3>
          <p className="text-sm text-muted-foreground">Connect WebMCP to let your assistant inspect, edit and preview this draft. Review the result here before saving or submitting.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { setEnabled(!enabled); setStatus(''); }}>
          {enabled ? 'Disable WebMCP' : 'Enable WebMCP'}
        </Button>
      </div>
      {enabled && <p className="text-xs text-muted-foreground">Configure your MCP client with <code>npx -y @jason.today/webmcp@0.1.13 --mcp</code>, then ask it to generate a connection token. Keep this Studio tab open. <a className="underline" href="https://webmcp.dev/" target="_blank" rel="noreferrer">Connection guide</a></p>}
      <p role="status" className="text-xs">{status}</p>
    </section>
  );
}
