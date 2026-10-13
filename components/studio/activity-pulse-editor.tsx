'use client';

import type { Block } from '@/packages/contracts/src/blocks';
import { Button } from '@/components/ui/button';

type EditableBlock = Extract<Block, { type: 'activities' | 'pulse' }>;
const inputClass = 'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm';

export default function ActivityPulseEditor({ block, onChange }: { block: EditableBlock; onChange: (block: EditableBlock) => void }) {
  return (
    <div className="space-y-3">
      <label className="block text-xs">Section title
        <input aria-label="Section title" maxLength={100} value={block.props.title || ''} onChange={(event) => onChange({ ...block, props: { ...block.props, title: event.target.value } } as EditableBlock)} className={inputClass} />
      </label>
      {block.type === 'pulse' ? <>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={block.props.showHistory} onChange={(event) => onChange({ ...block, props: { ...block.props, showHistory: event.target.checked } })} /> Show measured history
        </label>
        <p className="text-xs text-muted-foreground">Pulse measures the product website. Status and latency come from collected samples; no history is available until monitoring has run. Preview does not trigger a probe.</p>
      </> : <>
        <p className="text-xs text-muted-foreground">Share real product updates. Entries appear newest first. Empty feeds show “No activity updates yet”.</p>
        {block.props.entries.map((entry, index) => {
          const update = (fields: Partial<typeof entry>) => onChange({ ...block, props: { ...block.props, entries: block.props.entries.map((item, i) => i === index ? { ...item, ...fields } : item) } });
          return <fieldset key={index} className="rounded-xl border border-white/10 p-3 space-y-2">
            <legend className="text-xs">Update {index + 1}</legend>
            <label className="block text-xs">Date<input aria-label={'Activity date ' + (index + 1)} type="date" value={entry.date} onChange={(event) => update({ date: event.target.value })} className={inputClass} /></label>
            <label className="block text-xs">Title<input aria-label={'Activity title ' + (index + 1)} maxLength={160} value={entry.title} onChange={(event) => update({ title: event.target.value })} className={inputClass} /></label>
            <label className="block text-xs">Description<textarea aria-label={'Activity description ' + (index + 1)} maxLength={2000} value={entry.description || ''} onChange={(event) => update({ description: event.target.value || undefined })} className={inputClass} /></label>
            <label className="block text-xs">Link (optional)<input aria-label={'Activity link ' + (index + 1)} type="url" value={entry.url || ''} onChange={(event) => update({ url: event.target.value || undefined })} className={inputClass} /></label>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...block, props: { ...block.props, entries: block.props.entries.filter((_, i) => i !== index) } })}>Remove update</Button>
          </fieldset>;
        })}
        <Button type="button" variant="outline" size="sm" disabled={block.props.entries.length >= 50} onClick={() => onChange({ ...block, props: { ...block.props, entries: [...block.props.entries, { date: new Date().toISOString().slice(0, 10), title: '' }] } })}>Add activity update</Button>
      </>}
    </div>
  );
}
