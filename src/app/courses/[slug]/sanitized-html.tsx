'use client';

import DOMPurify from 'isomorphic-dompurify';

/**
 * Renders admin-authored lesson HTML after sanitising it.
 *
 * This lives in its own module, loaded by CourseViewer via next/dynamic with
 * `ssr: false`, so that `isomorphic-dompurify` is NEVER part of the server
 * bundle. On the server that package pulls in jsdom, whose dependency chain
 * (html-encoding-sniffer -> @exodus/bytes) is now ESM-only; Next externalises
 * jsdom and require()s it at runtime, which throws ERR_REQUIRE_ESM and 500s
 * the whole page. Keeping it browser-only sidesteps the chain entirely while
 * preserving the exact sanitiser configuration.
 */
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'ul', 'ol', 'li',
  'strong', 'em', 'a', 'code', 'pre', 'blockquote', 'img', 'div', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'class', 'target', 'rel', 'title'];

export default function SanitizedHtml({
  html,
  className,
}: {
  html: string | null;
  className?: string;
}) {
  if (!html) return null;

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });

  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
