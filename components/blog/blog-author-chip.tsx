/** Author avatar + name: a founder portrait when the name matches FOUNDERS, otherwise a star monogram. */
import React from "react";
import type { BlogAuthor } from "@/lib/blog/blog-authors";
import { cn } from "@/lib/utils";
import { StarGlyph } from "./blog-orbit-lens";

export function BlogAuthorAvatar({ author, size }: { author: BlogAuthor; size: number }) {
  if (author.avatar) {
    // A decorative background, not an <img>: the name is always printed next to it, and the markdown
    // twin of the page then carries no empty-alt image. The path comes from FOUNDERS (a constant).
    return <span className="blog-avatar blog-avatar-photo" style={{ width: size, height: size, backgroundImage: `url("${author.avatar}")` }} aria-hidden="true" />;
  }
  return (
    <span className="blog-avatar blog-monogram" style={{ width: size, height: size }} aria-hidden="true">
      <span className="blog-monogram-letter">{author.initial}</span>
      <StarGlyph className="blog-monogram-star" />
    </span>
  );
}

/** Decorative avatar plus the visible name; `label` (e.g. "Written by") is announced but kept visually quiet. */
export function BlogAuthorChip({ author, label, size = 28, className }: { author: BlogAuthor; label?: string; size?: number; className?: string }) {
  return (
    <span className={cn("blog-author", className)}>
      <BlogAuthorAvatar author={author} size={size} />
      <span className="blog-author-name">
        {label && <span className="sr-only">{label} </span>}
        {author.name}
      </span>
    </span>
  );
}
