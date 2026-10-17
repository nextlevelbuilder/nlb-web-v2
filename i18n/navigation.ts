import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Locale-aware navigation helpers: links keep the active locale prefix (`/vi/...`). */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
