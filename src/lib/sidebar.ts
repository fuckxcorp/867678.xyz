const sidebar = document.querySelector<HTMLElement>(".sidebar");
const trigger = document.querySelector<HTMLButtonElement>(".nav-trigger");
const closeButtons = document.querySelectorAll<HTMLElement>("[data-nav-close]");
const themeToggle = document.querySelector<HTMLButtonElement>(
  "[data-theme-toggle]",
);
const mobileNav = matchMedia("(max-width: 640px)");

const isNavActive = (href: string, pathname: string) =>
  href === "/" ? pathname === href : pathname.startsWith(href);

const syncActive = () => {
  const pathname = location.pathname;
  sidebar?.querySelectorAll<HTMLAnchorElement>("a.nav-item").forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    const active = isNavActive(href, pathname);
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  sidebar
    ?.querySelectorAll<HTMLDetailsElement>("details.nav-group")
    .forEach((group) => {
      if (group.querySelector("a.nav-item.active")) group.open = true;
    });
};

const syncNavState = (): void => {
  const mobile = mobileNav.matches;
  const open =
    mobile && document.documentElement.classList.contains("nav-open");
  if (!mobile) document.documentElement.classList.remove("nav-open");
  if (sidebar) {
    sidebar.inert = mobile && !open;
    if (mobile && !open) sidebar.setAttribute("aria-hidden", "true");
    else sidebar.removeAttribute("aria-hidden");
  }
  const main = document.querySelector<HTMLElement>(".pages-wrapper");
  if (main) main.inert = open;
  trigger?.setAttribute("aria-expanded", String(open));
};

const setOpen = (open: boolean): void => {
  const wasOpen = document.documentElement.classList.contains("nav-open");
  document.documentElement.classList.toggle(
    "nav-open",
    mobileNav.matches && open,
  );
  syncNavState();
  if (open) sidebar?.querySelector<HTMLElement>("a, button")?.focus();
  else if (wasOpen) trigger?.focus();
};

trigger?.addEventListener("click", () => setOpen(true));
closeButtons.forEach((button) =>
  button.addEventListener("click", () => setOpen(false)),
);
sidebar?.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    if (matchMedia("(max-width: 640px)").matches) setOpen(false);
  }),
);
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    document.documentElement.classList.contains("nav-open")
  ) {
    setOpen(false);
    return;
  }
  if (
    event.key !== "Tab" ||
    !mobileNav.matches ||
    !document.documentElement.classList.contains("nav-open") ||
    !sidebar
  )
    return;
  const focusable = Array.from(
    sidebar.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

mobileNav.addEventListener("change", syncNavState);

const themeModes = ["auto", "light", "dark"] as const;
themeToggle?.addEventListener("click", () => {
  const current = (document.documentElement.dataset.themeMode ??
    "auto") as (typeof themeModes)[number];
  const next =
    themeModes[(themeModes.indexOf(current) + 1) % themeModes.length];
  document.documentElement.dataset.themeMode = next;
  localStorage.setItem("theme", next);
  const dark =
    next === "dark" ||
    (next === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
});

document.addEventListener("astro:page-load", () => {
  syncActive();
  syncNavState();
});
syncNavState();
