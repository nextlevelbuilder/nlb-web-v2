/**
 * The chapter plate (roman numeral, name, hairline rule, sky coordinate) with the same classes as
 * components/constellation/chapter-plate.tsx, but as a <div>: the blog places it inside an article
 * <header>, where a nested <header> is not allowed.
 */
import React from "react";

export function BlogPlate({ numeral, name, coord }: { numeral: string; name: string; coord: string }) {
  return (
    <div className="plate mono blog-plate">
      <span className="rn">{numeral}</span>
      <span className="blog-plate-name">{name}</span>
      <span className="rule" aria-hidden="true" />
      <span className="coord">{coord}</span>
    </div>
  );
}

/** Numeral of the blog chapter, after the home page's 0-VIII. */
export const BLOG_NUMERAL = "IX";
