import type { Post } from "./types";
import { usernameKey } from "./validation";

export function postPath(post: Post): string {
  return `/fuckxter/post/${encodeURIComponent(post.author.handle)}/${encodeURIComponent(post.slug)}`;
}

export function userPath(handle: string): string {
  const normalized = handle.replace(/^@/, "").normalize("NFKC").trim();
  return `/fuckxter/user/${encodeURIComponent(normalized)}`;
}

export function parsePostPath(
  pathname: string,
): { handle: string; slug: string } | null {
  const match = pathname.match(/^\/fuckxter\/post\/([^/]+)\/([^/]+)\/?$/i);
  if (!match) return null;
  try {
    return {
      handle: usernameKey(decodeURIComponent(match[1])),
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
    return usernameKey(decodeURIComponent(match[1]).replace(/^@/, ""));
  } catch {
    return null;
  }
}
