import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Engine = typeof import('@/lib/site-audio/site-sound-engine');

/** Minimal Web Audio stand-in that records the nodes the engine creates. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'running' | 'suspended' = 'suspended';
  currentTime = 0;
  destination = {};
  sources: Array<{ loop: boolean; buffer: unknown; started: boolean; playbackRate: { value: number } }> = [];
  constructor() { FakeAudioContext.instances.push(this); }
  createGain() {
    const gain = { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
    return { gain, connect: vi.fn((node: unknown) => node) };
  }
  createBufferSource() {
    const source = {
      loop: false, buffer: null as unknown, started: false, playbackRate: { value: 1 },
      connect: vi.fn((node: unknown) => node), start() { source.started = true; },
    };
    this.sources.push(source);
    return source;
  }
  decodeAudioData = vi.fn(async () => ({ duration: 1 }));
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
}

let stored: Record<string, string>;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loadEngine(): Promise<Engine> {
  vi.resetModules();
  return import('@/lib/site-audio/site-sound-engine');
}

beforeEach(() => {
  stored = {};
  FakeAudioContext.instances = [];
  vi.stubGlobal('window', {
    AudioContext: FakeAudioContext,
    localStorage: { getItem: (k: string) => stored[k] ?? null, setItem: (k: string, v: string) => { stored[k] = v; } },
  });
  vi.stubGlobal('document', { hidden: false });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8))));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('site sound engine', () => {
  it('is off by default and creates no audio until turned on', async () => {
    const engine = await loadEngine();
    engine.hydrateSound();
    engine.playEffect('tap');
    expect(engine.isSoundEnabled()).toBe(false);
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('turning on starts a gapless looping ambient track and remembers the choice', async () => {
    const engine = await loadEngine();
    const listener = vi.fn();
    engine.subscribeSound(listener);
    engine.setSoundEnabled(true);
    await flush(); await flush();
    expect(stored['nlb-sound']).toBe('on');
    expect(listener).toHaveBeenCalledTimes(1);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.resume).toHaveBeenCalled();
    const ambient = ctx.sources.find((s) => s.loop);
    expect(ambient?.started).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/audio/ambient-loop.mp3');
  });

  it('plays effects only while on, and throttles repeats of the same effect', async () => {
    const engine = await loadEngine();
    engine.setSoundEnabled(true);
    await flush(); await flush();
    const ctx = FakeAudioContext.instances[0];
    const before = ctx.sources.length;
    engine.playEffect('twinkle');
    engine.playEffect('twinkle');
    await flush();
    expect(ctx.sources.length).toBe(before + 1);
    engine.setSoundEnabled(false);
    expect(stored['nlb-sound']).toBe('off');
    engine.playEffect('tap');
    await flush();
    expect(ctx.sources.length).toBe(before + 1);
  });

  it('restores a stored "on" but waits for a gesture before making sound', async () => {
    stored['nlb-sound'] = 'on';
    const engine = await loadEngine();
    engine.hydrateSound();
    expect(engine.isSoundEnabled()).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(0);
    engine.resumeSound();
    await flush(); await flush();
    expect(FakeAudioContext.instances[0].sources.some((s) => s.loop && s.started)).toBe(true);
  });

  it('survives blocked storage and missing Web Audio', async () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } },
    });
    const engine = await loadEngine();
    expect(() => engine.hydrateSound()).not.toThrow();
    expect(() => engine.setSoundEnabled(true)).not.toThrow();
    await flush();
    expect(engine.isSoundEnabled()).toBe(true);
    expect(() => engine.playEffect('tap')).not.toThrow();
  });
});
