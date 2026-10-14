/**
 * Shared scene state: scroll-driven progress values written by the chapter timelines and read every
 * frame by the WebGL sky. All progress values are 0..1.
 */
export interface SceneState {
  /** First-light intro (the hero point ignites). */
  intro: number;
  /** Hook pin: the point splits into the field. */
  split: number;
  /** Chapter I pin: the field dims. */
  dark: number;
  /** Community approach (before the pin). */
  pre: number;
  /** Community pin progress, normalised so the snap completes at 70% of the pin. */
  formPin: number;
  /** Combined constellation formation. */
  form: number;
  /** Courses entry: the constellation dissolves into a quiet field. */
  settle: number;
  /** Finale: every star gathers into one. */
  gather: number;
  /** Finale CTA hover: eased ignition and its target. */
  ignite: number;
  igniteT: number;
  /** Pointer position in CSS px and whether it is inside the window. */
  mx: number;
  my: number;
  mOn: boolean;
}

export function createSceneState(reducedMotion: boolean): SceneState {
  return {
    intro: reducedMotion ? 1 : 0,
    split: 0, dark: 0, pre: 0, formPin: 0, form: 0, settle: 0, gather: 0,
    ignite: 0, igniteT: 0, mx: -9999, my: -9999, mOn: false,
  };
}

type ChapterState = Partial<Pick<SceneState, 'split' | 'dark' | 'form' | 'settle' | 'gather'>>;

/** Reduced motion: the sky jumps to one static state per chapter (keyed by data-ch), with no animation. */
export const REDUCED_MOTION_STATES: Record<number, ChapterState> = {
  0: { split: 0, dark: 0, form: 0, settle: 0, gather: 0 },
  1: { split: 1, dark: 1, form: 0, settle: 0, gather: 0 },
  2: { split: 1, dark: 1, form: 1, settle: 0, gather: 0 },
  3: { split: 1, form: 1, settle: 1, gather: 0 },
  4: { split: 1, form: 1, settle: 1, gather: 0 },
  5: { split: 1, form: 1, settle: 1, gather: 0 },
  6: { split: 1, form: 1, settle: 1, gather: 0 },
  7: { split: 1, form: 1, settle: 1, gather: 0 },
  8: { split: 1, form: 1, settle: 1, gather: 1 },
};
