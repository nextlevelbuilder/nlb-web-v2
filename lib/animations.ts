import { Variants, Transition } from 'framer-motion';

// Standard easing curves for premium feel
export const easings = {
  premium: [0.16, 1, 0.3, 1] as const,
  premiumIn: [0.7, 0, 0.84, 0] as const,
  premiumBounce: [0.34, 1.56, 0.64, 1] as const,
  spring: { type: 'spring' as const, stiffness: 400, damping: 30 },
};

// Standard durations
export const durations = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  entrance: 0.6,
  stagger: 0.08,
};

// Reusable transition presets
export const transitions: Record<string, Transition> = {
  fast: { duration: durations.fast, ease: easings.premium },
  normal: { duration: durations.normal, ease: easings.premium },
  slow: { duration: durations.slow, ease: easings.premium },
  entrance: { duration: durations.entrance, ease: easings.premium },
  bounce: { duration: durations.normal, ease: easings.premiumBounce },
  spring: easings.spring,
};

// Fade in from bottom (most common)
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.entrance,
  },
};

// Fade in from larger offset (for sections)
export const fadeInUpLarge: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: easings.premium },
  },
};

// Simple fade
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

// Scale in (for modals, popovers)
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.normal,
  },
};

// Stagger container
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: durations.stagger,
      delayChildren: 0.1,
    },
  },
};

// Stagger item
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.entrance,
  },
};

// Hover lift effect
export const hoverLift = {
  y: -4,
  transition: { duration: 0.2, ease: easings.premiumBounce },
};

// Hover scale effect
export const hoverScale = {
  scale: 1.02,
  transition: { duration: 0.2, ease: easings.premiumBounce },
};

// Press effect
export const tapScale = {
  scale: 0.98,
};

// Slide in from left
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: transitions.entrance,
  },
};

// Slide in from right
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: transitions.entrance,
  },
};

// Viewport settings for whileInView
export const viewportOnce = { once: true, margin: '-100px' };
export const viewportOnceSmall = { once: true, margin: '-50px' };
