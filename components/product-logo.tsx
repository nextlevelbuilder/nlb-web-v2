'use client';

import { useEffect, useRef, useState } from 'react';

interface ProductLogoProps {
  src?: string | null;
  name: string;
  imgClassName?: string;
  imgWidth?: number;
  imgHeight?: number;
}

/**
 * Product logo for the fixed-size avatar boxes used across catalog surfaces.
 * Degrades to the name's initial when no logo is set or the asset fails to load.
 *
 * The mount check is required, not defensive: these surfaces are server-rendered, so a
 * dead logo URL resolves before hydration. React attaches `onError` only at hydration and
 * never replays an error event that already fired, which would leave a broken image box.
 * `onError` still covers failures that happen after hydration.
 *
 * Failure is tracked per-src so a later logo edit (Studio live preview) gets a fresh chance.
 */
export default function ProductLogo({
  src,
  name,
  imgClassName = 'w-full h-full object-cover',
  imgWidth,
  imgHeight,
}: ProductLogoProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailedSrc(src ?? null);
  }, [src]);

  if (!src || failedSrc === src) return <>{name.charAt(0).toUpperCase()}</>;

  return (
    <img
      ref={imgRef}
      src={src}
      alt={name}
      width={imgWidth}
      height={imgHeight}
      decoding="async"
      className={imgClassName}
      onError={() => setFailedSrc(src)}
    />
  );
}
