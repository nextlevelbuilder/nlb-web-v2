/**
 * Site sound: an ambient space loop plus a few quiet UI effects, all generated with ElevenLabs and
 * served from /audio. Sound is off until the visitor turns it on (browsers block autoplay anyway);
 * the choice is remembered per browser. Web Audio is used instead of <audio> so the loop is gapless,
 * volume can fade, and effects can overlap. Everything is created lazily on the first user gesture.
 */

export type SoundEffect = 'tap' | 'twinkle' | 'whoosh';

const STORAGE_KEY = 'nlb-sound';
const AMBIENT_SRC = '/audio/ambient-loop.mp3';
const EFFECT_SRC: Record<SoundEffect, string> = {
  tap: '/audio/ui-tap.mp3',
  twinkle: '/audio/star-twinkle.mp3',
  whoosh: '/audio/soft-whoosh.mp3',
};
/** Kept low: the music sits behind reading, effects are a hint rather than a signal. */
const AMBIENT_VOLUME = 0.32;
const EFFECT_VOLUME: Record<SoundEffect, number> = { tap: 0.35, twinkle: 0.3, whoosh: 0.28 };
/** Minimum gap between two plays of the same effect, so sweeping the pointer never machine-guns. */
const EFFECT_COOLDOWN_MS: Record<SoundEffect, number> = { tap: 60, twinkle: 140, whoosh: 600 };
const FADE_IN_S = 2.5;
const FADE_OUT_S = 0.6;

type Listener = () => void;

let enabled = false;
let hydrated = false;
const listeners = new Set<Listener>();

let ctx: AudioContext | null = null;
let ambientGain: GainNode | null = null;
let effectGain: GainNode | null = null;
let ambientSource: AudioBufferSourceNode | null = null;
let ambientBuffer: Promise<AudioBuffer | null> | null = null;
const effectBuffers = new Map<SoundEffect, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundEffect, number>();
let suspendTimer: ReturnType<typeof setTimeout> | undefined;

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeStored(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode or blocked storage: the choice simply lasts for this page view.
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  ambientGain = ctx.createGain();
  ambientGain.gain.value = 0;
  ambientGain.connect(ctx.destination);
  effectGain = ctx.createGain();
  effectGain.connect(ctx.destination);
  return ctx;
}

function load(src: string): Promise<AudioBuffer | null> {
  const context = audioContext();
  if (!context) return Promise.resolve(null);
  return fetch(src)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`${res.status}`))))
    .then((data) => context.decodeAudioData(data))
    .catch(() => null);
}

function effectBuffer(effect: SoundEffect) {
  let buffer = effectBuffers.get(effect);
  if (!buffer) {
    buffer = load(EFFECT_SRC[effect]);
    effectBuffers.set(effect, buffer);
  }
  return buffer;
}

async function startAmbient() {
  const context = audioContext();
  if (!context || !ambientGain) return;
  clearTimeout(suspendTimer);
  if (context.state === 'suspended') await context.resume().catch(() => {});
  ambientBuffer ??= load(AMBIENT_SRC);
  const buffer = await ambientBuffer;
  if (!buffer || !enabled || document.hidden) return;
  if (!ambientSource) {
    ambientSource = context.createBufferSource();
    ambientSource.buffer = buffer;
    ambientSource.loop = true;
    ambientSource.connect(ambientGain);
    ambientSource.start();
  }
  const now = context.currentTime;
  ambientGain.gain.cancelScheduledValues(now);
  ambientGain.gain.setValueAtTime(ambientGain.gain.value, now);
  ambientGain.gain.linearRampToValueAtTime(AMBIENT_VOLUME, now + FADE_IN_S);
}

/** Fades the music out, then suspends the context so a silent tab costs nothing. */
function stopAmbient() {
  if (!ctx || !ambientGain) return;
  const now = ctx.currentTime;
  ambientGain.gain.cancelScheduledValues(now);
  ambientGain.gain.setValueAtTime(ambientGain.gain.value, now);
  ambientGain.gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
  clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => { void ctx?.suspend().catch(() => {}); }, FADE_OUT_S * 1000 + 100);
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function subscribeSound(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reads the stored choice once on the client. Audio itself waits for a user gesture ({@link resumeSound}). */
export function hydrateSound() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  if (readStored()) {
    enabled = true;
    emit();
  }
}

/** Called from a user gesture: browsers only let audio start inside one. */
export function resumeSound() {
  if (enabled) void startAmbient();
}

export function setSoundEnabled(on: boolean) {
  if (on === enabled) return;
  enabled = on;
  writeStored(on);
  emit();
  if (on) {
    void startAmbient();
    void effectBuffer('tap');
    void effectBuffer('twinkle');
    void effectBuffer('whoosh');
  } else {
    stopAmbient();
  }
}

/** Pauses the music while the tab is hidden and fades it back in on return. */
export function onSoundVisibilityChange() {
  if (!enabled) return;
  if (document.hidden) stopAmbient();
  else void startAmbient();
}

export function playEffect(effect: SoundEffect) {
  if (!enabled || !ctx || !effectGain || ctx.state !== 'running') return;
  const now = performance.now();
  if (now - (lastPlayed.get(effect) ?? -Infinity) < EFFECT_COOLDOWN_MS[effect]) return;
  lastPlayed.set(effect, now);
  void effectBuffer(effect).then((buffer) => {
    if (!buffer || !ctx || !effectGain || !enabled) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = EFFECT_VOLUME[effect];
    // A slight pitch drift keeps repeated chimes from sounding mechanical.
    if (effect === 'twinkle') source.playbackRate.value = 0.92 + Math.random() * 0.16;
    source.buffer = buffer;
    source.connect(gain).connect(effectGain);
    source.start();
  });
}
