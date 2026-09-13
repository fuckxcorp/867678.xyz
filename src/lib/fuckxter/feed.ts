import { navigate } from "astro:transitions/client";
import {
  createPost,
  getTimeline,
  searchPosts,
  toggleLike,
  toggleRepost,
  toggleSave,
  uploadMedia,
} from "./api";
import { getAccount, requestAuthentication, toFeedUser } from "./auth";
import { avatarGradient, el, fmtCount, renderPost, statusRow } from "./dom";
import { ApiError } from "./http";
import type { FeedTab, Post, PostMedia, SearchResult } from "./types";
import { postPath, userPath } from "./urls";

const MAX_CHARS = 500;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

const COLUMN_QUERIES: [string, number][] = [
  ["(min-width: 2200px)", 4],
  ["(min-width: 1024px)", 3],
  ["(min-width: 700px)", 2],
];

const columnCount = (): number => {
  for (const [query, count] of COLUMN_QUERIES) {
    if (matchMedia(query).matches) return count;
  }
  return 1;
};

interface FeedState {
  tab: FeedTab;
  cursor: string | null;
  done: boolean;
  loading: boolean;
  seq: number;
  search: string | null;
}

export interface FeedControls {
  syncUser: () => void;
  reload: () => void;
  dispose: () => void;
}

function searchHead(result: SearchResult, exit: () => void): HTMLElement {
  const head = el("div", "fk-search-head");
  const label = el("span");
  const strong = el("strong");
  strong.textContent = `“${result.query}”`;
  label.append(
    document.createTextNode(
      `搜索 ${strong.textContent} · ${result.posts.length} 条结果`,
    ),
  );
  const exitBtn = el("button", "fk-search-exit");
  exitBtn.type = "button";
  exitBtn.textContent = "返回推荐流";
  exitBtn.addEventListener("click", exit);
  head.append(label, exitBtn);
  return head;
}

export function mountFeed(container: HTMLElement): FeedControls {
  const scroller = container.querySelector<HTMLElement>(".fk-main")!;
  const feed = container.querySelector<HTMLElement>(".fk-feed")!;
  const sentinel = container.querySelector<HTMLElement>(".fk-sentinel")!;
  const spinner = sentinel.querySelector<HTMLElement>(".fk-spinner")!;
  const tabs = [...container.querySelectorAll<HTMLButtonElement>(".fk-tab")];
  const composer = container.querySelector<HTMLElement>(".fk-composer")!;
  const composerInput =
    container.querySelector<HTMLTextAreaElement>(".fk-composer-input")!;
  const composerBtn =
    container.querySelector<HTMLButtonElement>(".fk-post-btn")!;
  const charCount = container.querySelector<HTMLElement>(".fk-char-count")!;
  const composerAuthHint = container.querySelector<HTMLElement>(
    "[data-role=composer-auth-hint]",
  )!;
  const mediaInput = container.querySelector<HTMLInputElement>(
    "[data-role=media-input]",
  )!;
  const attachMediaBtn = container.querySelector<HTMLButtonElement>(
    "[data-role=attach-media]",
  )!;
  const mediaStatus = container.querySelector<HTMLElement>(
    "[data-role=media-status]",
  )!;
  const searchInput =
    container.querySelector<HTMLInputElement>(".fk-search-input")!;
  const composerAvatar = container.querySelector<HTMLElement>(
    ".fk-composer .fk-avatar",
  )!;
  let selectedMedia: PostMedia | null = null;
  let uploadingMedia = false;

  const syncComposerUser = () => {
    const account = getAccount();
    const me = toFeedUser(account);
    composerAvatar.setAttribute("style", avatarGradient(me.handle));
    composerAvatar.textContent = [...me.name][0] ?? "?";
    composerAvatar.title = `@${me.handle}`;
    composerAuthHint.hidden = Boolean(account);
    composerBtn.textContent = account ? "发帖" : "注册后发帖";
    composerInput.placeholder = account ? "有什么新鲜事？" : "注册后才能发帖";
    if (!account) {
      selectedMedia = null;
      mediaInput.value = "";
      mediaStatus.hidden = true;
    }
  };
  syncComposerUser();

  const state: FeedState = {
    tab: "foryou",
    cursor: null,
    done: false,
    loading: false,
    seq: 0,
    search: null,
  };

  let columnsRoot: HTMLElement | null = null;
  let columns: HTMLElement[] = [];
  let activeColumnCount = 0;
  const orderedPosts: HTMLElement[] = [];
  const postsById = new Map<string, Post>();

  const shortestColumn = (): HTMLElement => {
    let target = columns[0];
    for (const column of columns) {
      if (column.offsetHeight < target.offsetHeight) target = column;
    }
    return target;
  };

  const buildColumns = (count: number): HTMLElement => {
    const root = el("div", "fk-feed-columns");
    if (count > 1) root.classList.add("is-masonry");
    columns = Array.from({ length: count }, () => {
      const column = el("div", "fk-feed-col");
      root.append(column);
      return column;
    });
    activeColumnCount = count;
    return root;
  };

  const ensureLayout = (): void => {
    const count = columnCount();
    if (columnsRoot && count === activeColumnCount) return;
    const root = buildColumns(count);
    if (columnsRoot) columnsRoot.replaceWith(root);
    else feed.append(root);
    columnsRoot = root;
    for (const post of orderedPosts) shortestColumn().append(post);
  };

  const onMediaChange = () => ensureLayout();
  for (const [query] of COLUMN_QUERIES) {
    matchMedia(query).addEventListener("change", onMediaChange);
  }

  const resetFeed = (head?: HTMLElement): void => {
    orderedPosts.length = 0;
    feed.replaceChildren();
    if (head) feed.append(head);
    columnsRoot = null;
    activeColumnCount = 0;
    ensureLayout();
  };

  const addPost = (post: Post): HTMLElement => {
    ensureLayout();
    const node = renderPost(post);
    if (post.viewer?.saved) {
      node
        .querySelector<HTMLElement>('.fk-action[data-action="save"]')
        ?.classList.add("is-saved");
    }
    orderedPosts.push(node);
    postsById.set(post.id, post);
    shortestColumn().append(node);
    return node;
  };

  const setSentinelBusy = (busy: boolean) => {
    sentinel.classList.toggle("is-done", state.done && !busy);
    spinner.style.visibility = busy ? "visible" : "hidden";
  };

  const sentinelReached = (): boolean => {
    const rect = sentinel.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    return rect.top - view.bottom < 360;
  };

  const renderError = (retry: () => void) => {
    feed.querySelectorAll(".fk-status").forEach((node) => node.remove());
    const row = el("div", "fk-status");
    row.append(
      document.createTextNode("加载失败。"),
      Object.assign(el("button", "fk-retry-btn"), {
        type: "button",
        textContent: "重试",
      }),
    );
    row.querySelector("button")!.addEventListener("click", retry);
    feed.append(row);
  };

  const loadPage = async (replace: boolean) => {
    if (state.search !== null) return;
    if (!replace && (state.loading || state.done)) return;

    const seq = ++state.seq;
    state.loading = true;
    setSentinelBusy(true);
    try {
      const page = await getTimeline(state.tab, replace ? null : state.cursor);
      if (seq !== state.seq) return;
      if (replace) resetFeed();
      for (const post of page.posts) addPost(post);
      state.cursor = page.nextCursor;
      state.done = page.nextCursor === null;
      if (state.done && orderedPosts.length === 0) {
        feed.append(statusRow("还没有帖子，发布第一条吧。"));
      } else if (state.done) {
        feed.append(statusRow("你已看完全部内容"));
      } else if (sentinelReached()) {
        window.setTimeout(() => {
          if (seq === state.seq) loadPage(false);
        }, 0);
      }
    } catch {
      if (seq === state.seq) renderError(() => loadPage(replace));
    } finally {
      if (seq === state.seq) {
        state.loading = false;
        setSentinelBusy(false);
      }
    }
  };

  const exitSearch = () => {
    state.search = null;
    state.done = false;
    state.cursor = null;
    composer.hidden = false;
    searchInput.value = "";
    loadPage(true);
  };

  const doSearch = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) {
      if (state.search !== null) exitSearch();
      return;
    }
    const seq = ++state.seq;
    state.search = query;
    state.done = true;
    state.loading = true;
    composer.hidden = true;
    setSentinelBusy(true);
    try {
      const result = await searchPosts(query);
      if (seq !== state.seq) return;
      resetFeed(searchHead(result, exitSearch));
      if (result.posts.length === 0) feed.append(statusRow("没有找到相关内容"));
      for (const post of result.posts) addPost(post);
    } catch {
      if (seq === state.seq) renderError(() => doSearch(query));
    } finally {
      if (seq === state.seq) {
        state.loading = false;
        setSentinelBusy(false);
      }
    }
  };

  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void doSearch(searchInput.value);
  });

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const next = tab.dataset.tab as FeedTab | undefined;
      if (!next) return;
      if (state.search === null && next === state.tab) return;
      if (state.search !== null) {
        state.search = null;
        composer.hidden = false;
        searchInput.value = "";
      }
      state.tab = next;
      state.cursor = null;
      state.done = false;
      for (const item of tabs) item.classList.toggle("is-active", item === tab);
      void loadPage(true);
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadPage(false);
    },
    { root: scroller, rootMargin: "360px" },
  );
  observer.observe(sentinel);

  const flashCount = (button: HTMLElement) => {
    const counter = button.querySelector<HTMLElement>(".fk-action-count");
    if (!counter) return;
    counter.classList.remove("is-flash");
    void counter.offsetWidth;
    counter.classList.add("is-flash");
  };

  const setCount = (button: HTMLElement, count: number) => {
    button.querySelector<HTMLElement>(".fk-action-count")!.textContent =
      count > 0 ? fmtCount(count) : "";
  };

  feed.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const avatarLink = target.closest<HTMLElement>(".fk-avatar-link");
    if (avatarLink?.dataset.handle) {
      event.preventDefault();
      void navigate(userPath(avatarLink.dataset.handle));
      return;
    }

    const button = target.closest<HTMLButtonElement>(".fk-action");
    if (!button) {
      const article = target.closest<HTMLElement>(".fk-post");
      const id = article?.dataset.postId;
      const post = id ? postsById.get(id) : undefined;
      if (post) void navigate(postPath(post));
      return;
    }

    const article = button.closest<HTMLElement>(".fk-post");
    const id = article?.dataset.postId;
    const post = id ? postsById.get(id) : undefined;
    if (!id || !post) return;
    const action = button.dataset.action;

    if (action === "save") {
      const willSave = !button.classList.contains("is-saved");
      button.classList.toggle("is-saved", willSave);
      try {
        await toggleSave(post, willSave);
      } catch {
        button.classList.toggle("is-saved", !willSave);
      }
      return;
    }

    if (action === "like" || action === "repost") {
      const activeClass = action === "like" ? "is-liked" : "is-reposted";
      const willActive = !button.classList.contains(activeClass);
      button.classList.toggle(activeClass, willActive);
      flashCount(button);
      const current = Number(button.dataset.count ?? "0");
      const optimistic = Math.max(0, current + (willActive ? 1 : -1));
      button.dataset.count = String(optimistic);
      setCount(button, optimistic);
      try {
        let serverCount: number;
        let serverActive: boolean;
        if (action === "like") {
          const result = await toggleLike(id, willActive);
          serverCount = result.likes;
          serverActive = result.liked;
        } else {
          const result = await toggleRepost(id, willActive);
          serverCount = result.reposts;
          serverActive = result.reposted;
        }
        button.dataset.count = String(serverCount);
        setCount(button, serverCount);
        button.classList.toggle(activeClass, serverActive);
      } catch {
        button.classList.toggle(activeClass, !willActive);
        button.dataset.count = String(current);
        setCount(button, current);
      }
      return;
    }

    if (action === "reply") {
      composer.hidden = false;
      composerInput.value = `@${article.dataset.handle ?? ""} `;
      composerInput.focus();
      composerInput.setSelectionRange(
        composerInput.value.length,
        composerInput.value.length,
      );
      composerInput.scrollIntoView({ behavior: "smooth", block: "center" });
      syncComposer();
      return;
    }

    if (action === "share") {
      try {
        await navigator.clipboard.writeText(
          `${location.origin}${postPath(post)}`,
        );
        button.title = "已复制链接";
        setTimeout(() => {
          button.title = "分享";
        }, 1200);
      } catch {}
    }
  });

  const syncComposer = () => {
    const length = [...composerInput.value].length;
    charCount.textContent = `${length} / ${MAX_CHARS}`;
    charCount.classList.toggle("is-over", length > MAX_CHARS);
    composerBtn.disabled = length === 0 || length > MAX_CHARS || uploadingMedia;
  };
  composerInput.addEventListener("input", syncComposer);
  composerInput.addEventListener("input", () => {
    composerInput.style.height = "auto";
    composerInput.style.height = `${composerInput.scrollHeight}px`;
  });
  syncComposer();

  attachMediaBtn.addEventListener("click", () => {
    if (!getAccount()) {
      requestAuthentication();
      return;
    }
    mediaInput.click();
  });

  mediaInput.addEventListener("change", async () => {
    const file = mediaInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) {
      mediaStatus.textContent = "图片不能超过 10 MB";
      mediaStatus.hidden = false;
      mediaInput.value = "";
      return;
    }
    uploadingMedia = true;
    attachMediaBtn.disabled = true;
    mediaStatus.textContent = "上传中…";
    mediaStatus.hidden = false;
    syncComposer();
    try {
      selectedMedia = await uploadMedia(file);
      mediaStatus.textContent = `已添加：${file.name}`;
    } catch (error) {
      selectedMedia = null;
      mediaStatus.textContent =
        error instanceof Error ? error.message : "图片上传失败";
      if (error instanceof ApiError && error.status === 401) {
        requestAuthentication();
      }
    } finally {
      uploadingMedia = false;
      attachMediaBtn.disabled = false;
      mediaInput.value = "";
      syncComposer();
    }
  });

  composerBtn.addEventListener("click", async () => {
    if (!getAccount()) {
      requestAuthentication();
      return;
    }
    const text = composerInput.value.trim();
    if (!text) return;
    composerBtn.disabled = true;
    const label = composerBtn.textContent;
    composerBtn.textContent = "发送中…";
    try {
      await createPost(text, selectedMedia?.id);
      if (state.search !== null) {
        searchInput.value = "";
        state.search = null;
      }
      composer.hidden = false;
      state.cursor = null;
      state.done = false;
      composerInput.value = "";
      composerInput.style.height = "";
      selectedMedia = null;
      mediaStatus.hidden = true;
      syncComposer();

      scroller.scrollTo({ top: 0 });
      await loadPage(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        composerBtn.textContent = "注册后发帖";
        composerBtn.disabled = false;
        requestAuthentication();
        return;
      }
      composerBtn.textContent = "发送失败";
      setTimeout(() => {
        composerBtn.textContent = label;
        syncComposer();
      }, 1200);
      return;
    }
    composerBtn.textContent = label;
  });

  void loadPage(true);

  return {
    syncUser: syncComposerUser,
    reload: () => {
      state.cursor = null;
      state.done = false;
      void loadPage(true);
    },
    dispose: () => {
      observer.disconnect();
      for (const [query] of COLUMN_QUERIES) {
        matchMedia(query).removeEventListener("change", onMediaChange);
      }
    },
  };
}
