/** After the article body: tags, share row, author card and newer/older navigation in the same locale. */
import React from "react";
import Link from "next/link";
import type { BlogAuthor } from "@/lib/blog/blog-authors";
import { BLOG_COPY } from "@/lib/blog/blog-copy";
import { buildShareLinks } from "@/lib/blog/blog-share-links";
import { blogIndexPath, blogPostPath } from "@/lib/blog/blog-slug-rules";
import type { BlogAdjacentPosts, BlogLocale, BlogPostSummary } from "@/lib/blog/blog-types";
import { BlogAuthorAvatar } from "./blog-author-chip";
import { BlogCopyButton } from "./blog-copy-button";

export const blogTagHref = (locale: BlogLocale, tag: string) => `${blogIndexPath(locale)}?tag=${encodeURIComponent(tag)}`;

interface BlogPostFooterProps {
  locale: BlogLocale;
  title: string;
  tags: string[];
  publicUrl: string;
  author: BlogAuthor | null;
  adjacent: BlogAdjacentPosts;
}

function AdjacentLink({ post, label, direction }: { post: BlogPostSummary; label: string; direction: "newer" | "older" }) {
  return (
    <Link className={`blog-adjacent-link is-${direction}`} href={blogPostPath(post.locale, post.slug)} rel={direction === "newer" ? "prev" : "next"}>
      <span className="mono blog-adjacent-label">
        {direction === "newer" && <span aria-hidden="true">← </span>}
        {label}
        {direction === "older" && <span aria-hidden="true"> →</span>}
      </span>
      <span className="blog-adjacent-title">{post.title}</span>
    </Link>
  );
}

export function BlogPostFooter({ locale, title, tags, publicUrl, author, adjacent }: BlogPostFooterProps) {
  const copy = BLOG_COPY[locale];
  const share = buildShareLinks(publicUrl, title);
  const networks = [
    { name: "X", href: share.x },
    { name: "Facebook", href: share.facebook },
    { name: "LinkedIn", href: share.linkedin },
  ];
  const founders = locale === "vi" ? "/vi#founders" : "/#founders";

  return (
    <footer className="blog-post-foot">
      {tags.length > 0 && (
        <div className="blog-foot-row">
          <h2 className="mono blog-foot-label">{copy.tagsLabel}</h2>
          <ul className="blog-tag-list">
            {tags.map((tag) => (
              <li key={tag}><Link className="blog-tag" href={blogTagHref(locale, tag)}>#{tag}</Link></li>
            ))}
          </ul>
        </div>
      )}

      <div className="blog-foot-row">
        <h2 className="mono blog-foot-label">{copy.shareHeading}</h2>
        <BlogCopyButton text={share.url} label={copy.copyLink} idleText={copy.copyLink} copiedText={copy.copied} failedText={copy.copyFailed} className="blog-tag" />
        <ul className="blog-share">
          {networks.map((network) => (
            <li key={network.name}>
              <a className="blog-tag" href={network.href} target="_blank" rel="noopener noreferrer" aria-label={copy.shareOn(network.name)}>
                {network.name}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {author && (
        <section className="surface blog-author-card" aria-labelledby="blog-author-heading">
          <BlogAuthorAvatar author={author} size={72} />
          <div className="blog-author-card-body">
            <h2 id="blog-author-heading" className="mono blog-foot-label">{copy.authorHeading}</h2>
            <p className="blog-author-card-name">{author.name}</p>
            {author.role && <p className="mono blog-author-card-role">{author.role}</p>}
            {author.founderId && (
              <Link className="link-arrow" href={founders}>{copy.meetFounders} <span aria-hidden="true">→</span></Link>
            )}
          </div>
        </section>
      )}

      {(adjacent.newer || adjacent.older) && (
        <nav className="blog-adjacent" aria-label={copy.adjacentLabel}>
          {adjacent.newer ? <AdjacentLink post={adjacent.newer} label={copy.newerPost} direction="newer" /> : <span className="blog-adjacent-empty" />}
          {adjacent.older ? <AdjacentLink post={adjacent.older} label={copy.olderPost} direction="older" /> : <span className="blog-adjacent-empty" />}
        </nav>
      )}
    </footer>
  );
}
