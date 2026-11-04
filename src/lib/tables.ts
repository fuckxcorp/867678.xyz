export {};

let stop: (() => void) | undefined;

const initTables = (): void => {
  stop?.();

  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(".toc-item a"),
  );
  const scroller = document.querySelector<HTMLElement>(".pages-wrapper");
  const toc = document.querySelector<HTMLElement>(".toc");
  if (!links.length || !scroller) return;

  const headings = links.flatMap((link) => {
    const id = link.getAttribute("href")?.slice(1);
    const heading = id ? document.getElementById(id) : null;
    return heading ? [heading] : [];
  });
  if (!headings.length) return;

  const setActive = (id: string): void => {
    links.forEach((link) => {
      const on = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("active", on);
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });

    const active = toc?.querySelector<HTMLElement>("a.active");
    if (!toc || !active) return;
    if (id === headings[0].id) {
      toc.scrollTop = 0;
      return;
    }
    const tocBox = toc.getBoundingClientRect();
    const linkBox = active.getBoundingClientRect();
    if (linkBox.top < tocBox.top) toc.scrollTop -= tocBox.top - linkBox.top;
    else if (linkBox.bottom > tocBox.bottom)
      toc.scrollTop += linkBox.bottom - tocBox.bottom;
  };

  const sync = (): void => {
    if (scroller.scrollTop <= 8) {
      setActive(headings[0].id);
      return;
    }

    const atBottom =
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 24;
    if (atBottom) {
      setActive(headings[headings.length - 1].id);
      return;
    }

    const marker = scroller.getBoundingClientRect().top + 96;
    let current = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= marker) current = heading;
      else break;
    }
    setActive(current.id);
  };

  scroller.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);
  sync();

  stop = () => {
    scroller.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
  };
};

document.addEventListener("astro:page-load", initTables);
