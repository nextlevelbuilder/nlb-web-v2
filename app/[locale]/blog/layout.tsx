import type { ReactNode } from "react";
import "./blog-pages.css";

/** Blog segment: only loads the blog stylesheet (index and post pages share it). */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return children;
}
