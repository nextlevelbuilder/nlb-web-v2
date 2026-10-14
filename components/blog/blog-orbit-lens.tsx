/**
 * Decorative star-atlas illustrations for posts and products without an image, in the course-lens
 * language (graticule cross, orbits, a haloed core). Static on purpose: no SMIL loops, so nothing moves
 * for reduced-motion users; the hover glow is a CSS transition from the shared `.lens` rules.
 */
import React from "react";

function LensFeature() {
  return (
    <>
      <g transform="translate(160 104)">
        <ellipse className="orbit" rx="122" ry="40" />
        <ellipse className="orbit dash" rx="78" ry="26" transform="rotate(-8)" />
        <circle className="planet" cx="-96" cy="24" r="4.5" />
        <circle className="planet" cx="62" cy="-24" r="2.5" />
        <circle className="halo" r="18" />
        <path className="spk" d="M-22 0H22M0-22V22" />
        <circle className="core" r="4.5" />
      </g>
    </>
  );
}

function LensRinged() {
  return (
    <g transform="translate(160 102)">
      <ellipse className="orbit" rx="64" ry="14" transform="rotate(-14)" />
      <ellipse className="orbit" rx="82" ry="19" transform="rotate(-14)" opacity=".6" />
      <ellipse className="orbit dash" rx="134" ry="48" transform="rotate(6)" />
      <circle className="planet" cx="118" cy="34" r="3.5" />
      <circle className="halo" r="22" />
      <path className="spk" d="M-26 0H26M0-26V26" />
      <circle className="core" r="7" />
    </g>
  );
}

function LensBinary() {
  return (
    <g transform="translate(160 100)">
      <ellipse className="orbit dash" rx="104" ry="34" />
      <circle className="orbit" r="58" opacity=".5" />
      <circle className="halo" cx="-20" r="14" />
      <circle className="core" cx="-20" r="4" />
      <circle className="planet" cx="24" r="3" />
      <circle className="planet" cx="-88" cy="-18" r="2.5" />
      <path className="spk" d="M-40 0H0M-20-20V20" />
    </g>
  );
}

const VARIANTS = [LensFeature, LensRinged, LensBinary] as const;

/** One of three orbit plates; `variant` is any integer (wrapped), usually lensVariant(seedFrom(slug)). */
export function BlogOrbitLens({ variant }: { variant: number }) {
  const Variant = VARIANTS[((variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <path className="grid-l" d="M0 100H320M160 0V200" />
      <Variant />
    </svg>
  );
}

/** Four-point star used as a glyph in callouts, dividers and rules. */
export function StarGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M8 0 9.4 6.6 16 8 9.4 9.4 8 16 6.6 9.4 0 8 6.6 6.6Z" fill="currentColor" />
    </svg>
  );
}
