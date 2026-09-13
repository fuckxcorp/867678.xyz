import type { Post } from "./types";

export function postPath(post: Post): string {
  return `/fuckxter/post/${encodeURIComponent(post.author.handle)}/${encodeURIComponent(post.slug)}`;
}

export function userPath(handle: string): string {
  return `/fuckxter/user/${encodeURIComponent(handle.replace(/^@/, "").toLowerCase())}`;
}

export function parsePostPath(
  pathname: string,
): { handle: string; slug: string } | null {
  const match = pathname.match(/^\/fuckxter\/post\/([^/]+)\/([^/]+)\/?$/i);
  if (!match) return null;
  try {
    return {
      handle: decodeURIComponent(match[1]).toLowerCase(),
      slug: match[2].toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function parseUserPath(pathname: string): string | null {
  const match = pathname.match(/^\/fuckxter\/user\/([^/]+)\/?$/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/^@/, "").toLowerCase();
  } catch {
    return null;
  }
}
