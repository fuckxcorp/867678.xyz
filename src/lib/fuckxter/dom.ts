import type { Post } from "./types";
import { apiEndpoint } from "./http";

export const ICONS = {
  reply:
    '<svg class="fk-action-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>',
  repost:
    '<svg class="fk-action-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
  heart:
    '<svg class="fk-action-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
  share:
    '<svg class="fk-action-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><path d="M16 6l-4-4-4 4"></path><path d="M12 2v13"></path></svg>',
  bookmark:
    '<svg class="fk-action-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
  verified:
    '<svg class="fk-verified" viewBox="0 0 24 24" aria-label="认证账号" role="img"><path fill="currentColor" d="M12 1.5l2.6 2 3.2-.4 1.2 3 3 1.2-.4 3.2 2 2.5-2 2.5.4 3.2-3 1.2-1.2 3-3.2-.4-2.6 2-2.6-2-3.2.4-1.2-3-3-1.2.4-3.2-2-2.5 2-2.5-.4-3.2 3-1.2 1.2-3 3.2.4z"></path><path class="fk-verified-check" d="M10.7 15.9l-3-3 1.3-1.3 1.7 1.7 4.3-4.3 1.3 1.3z"></path></svg>',
};

const AVATAR_GRADIENTS: [string, string][] = [
  ["#f97316", "#ef4444"],
  ["#8b5cf6", "#6366f1"],
  ["#06b6d4", "#3b82f6"],
  ["#10b981", "#14b8a6"],
  ["#f43f5e", "#ec4899"],
  ["#f59e0b", "#d97706"],
];

export function avatarGradient(handle: string): string {
  const hash = [...handle].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const [from, to] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  return `background-image: linear-gradient(135deg, ${from}, ${to})`;
}

export function relativeTime(iso: string): string {
  const diffSeconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (diffSeconds < 60) return "刚刚";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}分钟前`;
  if (diffSeconds < 86_400) return `${Math.floor(diffSeconds / 3600)}小时前`;
  if (diffSeconds < 86_400 * 7)
    return `${Math.floor(diffSeconds / 86_400)}天前`;
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export function fmtCount(n: number): string {
  if (n < 10_000) return String(n);
  const wan = n / 10_000;
  return `${wan >= 10 ? Math.round(wan) : Math.round(wan * 10) / 10}万`;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function actionButton(
  action: string,
  icon: string,
  label: string,
  count: number,
): HTMLButtonElement {
  const btn = el("button", "fk-action");
  btn.type = "button";
  btn.dataset.action = action;
  btn.dataset.count = String(count);
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.innerHTML = `${icon}<span class="fk-action-count"></span>`;
  btn.querySelector(".fk-action-count")!.textContent =
    count > 0 ? fmtCount(count) : "";
  return btn;
}

export function postHead(post: Post, timeMode: "relative" | "absolute") {
  const head = el("header", "fk-post-head");
  const name = el("span", "fk-post-name");
  name.textContent = post.author.name;
  head.append(name);
  if (post.author.verified)
    head.insertAdjacentHTML("beforeend", ICONS.verified);
  const meta = el("span", "fk-post-meta");
  meta.textContent = `@${post.author.handle} · ${
    timeMode === "relative"
      ? relativeTime(post.createdAt)
      : new Date(post.createdAt).toLocaleString("zh-CN")
  }`;
  head.append(meta);
  return head;
}

export function postMedia(post: Post): HTMLElement {
  const media = post.media;
  if (!media) return el("div");
  const node = el("div", "fk-media");
  const image = el("img", "fk-media-image");
  image.src = media.url.startsWith("/") ? apiEndpoint(media.url) : media.url;
  image.alt = media.alt;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  node.append(image);
  return node;
}

export function authorAvatar(
  handle: string,
  name: string,
  className = "fk-avatar",
): HTMLAnchorElement {
  const avatar = el("a", `${className} fk-avatar-link`);
  avatar.dataset.handle = handle;
  avatar.href = `/fuckxter/user/${encodeURIComponent(handle)}`;
  avatar.setAttribute("style", avatarGradient(handle));
  avatar.textContent = [...name][0] ?? "?";
  avatar.title = `查看 @${handle} 的主页`;
  avatar.setAttribute("aria-label", `查看 ${name}（@${handle}）的主页`);
  return avatar;
}

export function renderPost(post: Post): HTMLElement {
  const article = el("article", "fk-post");
  article.dataset.postId = post.id;
  article.dataset.handle = post.author.handle;

  const avatar = authorAvatar(post.author.handle, post.author.name);

  const body = el("div", "fk-post-body");
  body.append(postHead(post, "relative"));

  const text = el("p", "fk-post-text");
  text.textContent = post.text;
  body.append(text);

  if (post.media) body.append(postMedia(post));

  const actions = el("footer", "fk-actions");
  actions.append(
    actionButton("reply", ICONS.reply, "回复", post.stats.replies),
    actionButton("repost", ICONS.repost, "转发", post.stats.reposts),
    actionButton("like", ICONS.heart, "喜欢", post.stats.likes),
    actionButton("save", ICONS.bookmark, "收藏", 0),
    actionButton("share", ICONS.share, "分享", 0),
  );
  if (post.viewer?.reposted) {
    actions.children[1].classList.add("is-reposted");
  }
  if (post.viewer?.liked) {
    actions.children[2].classList.add("is-liked");
  }

  body.append(actions);
  article.append(avatar, body);
  return article;
}

export function renderPostDetail(post: Post): HTMLElement {
  const article = el("article", "fk-post-detail fk-post-content-only");
  article.dataset.postId = post.id;

  const body = el("div", "fk-post-body");

  const text = el("p", "fk-post-text");
  text.textContent = post.text;
  body.append(text);

  if (post.media) body.append(postMedia(post));

  article.append(body);
  return article;
}

export function statusRow(message: string): HTMLElement {
  const row = el("div", "fk-status");
  row.textContent = message;
  return row;
}
