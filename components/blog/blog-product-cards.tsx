/**
 * The `product-cards` block: up to six product plates in a 2-up grid. Each card is a single link
 * (the product name; a stretched ::after makes the whole plate clickable), so it is one tab stop whose
 * accessible name is the product name. The markup stays semantic (heading, link, list, figure) so the
 * markdown twin of a post reads as "### [Name](href)", the tagline, the tags and the maker.
 */
import React from "react";
import { BLOG_COPY } from "@/lib/blog/blog-copy";
import { lensVariant, seedFrom } from "@/lib/blog/blog-sky-seed";
import type { BlockViewProps } from "./blog-block-view-types";
import { BlogOrbitLens } from "./blog-orbit-lens";

export function ProductCardsBlock({ props, ctx }: BlockViewProps<"product-cards">) {
  const copy = BLOG_COPY[ctx.locale];
  const titleId = props.title ? ctx.nextId(props.title) : undefined;
  return (
    <section className="blog-products" {...(titleId ? { "aria-labelledby": titleId } : { "aria-label": copy.productsLabel })}>
      {props.title && (
        <h2 id={titleId} className="catalogue-head mono blog-products-head">
          <span>{props.title}</span>
          <span className="rule" aria-hidden="true" />
        </h2>
      )}
      <ul className="blog-products-grid">
        {props.items.map((item, index) => (
          <li key={`${item.href}-${index}`} className="surface blog-product">
            <figure className="lens blog-product-media">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- author-supplied https images of unknown size
                <img src={item.image} alt={copy.productPreviewAlt(item.name)} loading="lazy" decoding="async" />
              ) : (
                <BlogOrbitLens variant={lensVariant(seedFrom(item.name))} />
              )}
            </figure>
            <div className="blog-product-body">
              <span className="blog-product-logo" aria-hidden="true">
                {item.logo ? (
                  // Decorative (the name is the link text). A background keeps the markdown twin free of
                  // empty-alt images; imageSrc validation forbids quotes, so the URL cannot escape url("").
                  <span className="blog-product-logo-img" style={{ backgroundImage: `url("${item.logo}")` }} />
                ) : (
                  <span className="blog-product-initial" data-initial={Array.from(item.name)[0]} />
                )}
              </span>
              <h3 className="blog-product-name">
                <a href={item.href} className="blog-product-link">{item.name}</a>
              </h3>
              <p className="blog-product-tagline">{item.tagline}</p>
              {(item.tags?.length || item.maker) && (
                <div className="blog-product-foot">
                  {item.tags && item.tags.length > 0 && (
                    <ul className="blog-pills">
                      {item.tags.map((tag) => <li key={tag} className="mono">{tag}</li>)}
                    </ul>
                  )}
                  {item.maker && <p className="mono blog-product-maker">{copy.productBy(item.maker)}</p>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
