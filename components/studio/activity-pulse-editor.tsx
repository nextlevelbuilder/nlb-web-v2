'use client';

import type { Block } from '@nextlevelbuilder/contracts';
import { Button } from '@/components/ui/button';

type EditableBlock = Extract<Block, { type: 'activities' | 'pulse' }>;
const inputClass = 'mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2 text-step-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function ActivityPulseEditor({ block, onChange }: { block: EditableBlock; onChange: (block: EditableBlock) => void }) {
  return (
    <div className="space-y-3">
      <label className="block text-step-xs text-ink-2">Section title
        <input aria-label="Section title" maxLength={100} value={block.props.title || ''} onChange={(event) => onChange({ ...block, props: { ...block.props, title: event.target.value } } as EditableBlock)} className={inputClass} />
      </label>
      {block.type === 'pulse' ? <>
        <label className="flex min-h-10 items-center gap-2 text-step-sm">
          <input type="checkbox" checked={block.props.showHistory} onChange={(event) => onChange({ ...block, props: { ...block.props, showHistory: event.target.checked } })} /> Show measured history
        </label>
        <p className="text-step-xs text-ink-2">Pulse measures the product website. Status and latency come from collected samples; no history is available until monitoring has run. Preview does not trigger a probe.</p>
      </> : <>
        <p className="text-step-xs text-ink-2">Share real product updates. Entries appear newest first. Empty feeds show “No activity updates yet”.</p>
        {block.props.entries.map((entry, index) => {
          const update = (fields: Partial<typeof entry>) => onChange({ ...block, props: { ...block.props, entries: block.props.entries.map((item, i) => i === index ? { ...item, ...fields } : item) } });
          return <fieldset key={index} className="rounded-sm border border-line p-3 space-y-2">
            <legend className="mono-label px-1 text-ink-3">Update {index + 1}</legend>
            <label className="block text-step-xs text-ink-2">Date<input aria-label={'Activity date ' + (index + 1)} type="date" value={entry.date} onChange={(event) => update({ date: event.target.value })} className={inputClass} /></label>
            <label className="block text-step-xs text-ink-2">Title<input aria-label={'Activity title ' + (index + 1)} maxLength={160} value={entry.title} onChange={(event) => update({ title: event.target.value })} className={inputClass} /></label>
            <label className="block text-step-xs text-ink-2">Description<textarea aria-label={'Activity description ' + (index + 1)} maxLength={2000} value={entry.description || ''} onChange={(event) => update({ description: event.target.value || undefined })} className={inputClass} /></label>
            <label className="block text-step-xs text-ink-2">Link (optional)<input aria-label={'Activity link ' + (index + 1)} type="url" value={entry.url || ''} onChange={(event) => update({ url: event.target.value || undefined })} className={inputClass} /></label>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...block, props: { ...block.props, entries: block.props.entries.filter((_, i) => i !== index) } })}>Remove update</Button>
          </fieldset>;
        })}
        <Button type="button" variant="outline" size="sm" disabled={block.props.entries.length >= 50} onClick={() => onChange({ ...block, props: { ...block.props, entries: [...block.props.entries, { date: new Date().toISOString().slice(0, 10), title: '' }] } })}>Add activity update</Button>
      </>}
    </div>
  );
}
