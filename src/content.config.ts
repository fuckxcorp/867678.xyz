import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import type { Loader, LoaderContext } from "astro/loaders";
import { getMd } from "./lib/get-markdown";

interface RemoteEntry {
  id: string;
  title: string;
  url: string;
}

const HOME: RemoteEntry[] = [
  {
    id: "home",
    title: "Home",
    url: "https://cdn.jsdelivr.net/gh/moaeiou/moaeiou@main/README.md",
  },
];

const PROJECTS: RemoteEntry[] = [
  {
    id: "mio",
    title: "mio protocol",
    url: "https://cdn.jsdelivr.net/gh/orgmio/mio@main/README.md",
  },
  {
    id: "mcry",
    title: "MCRY",
    url: "https://cdn.jsdelivr.net/gh/orgmio/mcry@main/README.md",
  },
  {
    id: "qcsh",
    title: "QUICShell",
    url: "https://cdn.jsdelivr.net/gh/orgmio/qcsh@main/README.md",
  },
  {
    id: "cv",
    title: "CV",
    url: "https://cdn.jsdelivr.net/gh/orgmio/cv@main/README.md",
  },
  {
    id: "omio",
    title: "older mio protocol",
    url: "https://cdn.jsdelivr.net/gh/orgmio/mio@omio/README.md",
  },
  {
    id: "luci-app-oplist",
    title: "LuCI-APP-OpenList",
    url: "https://cdn.jsdelivr.net/gh/morouter/luci-app-oplist@main/README.md",
  },
  {
    id: "luci-app-rsop",
    title: "LuCI-APP-Rustdesk for OpenWrt",
    url: "https://cdn.jsdelivr.net/gh/morouter/luci-app-rsop@main/README.md",
  },
  {
    id: "luci-app-pm",
    title: "LuCI-APP-PowerManager",
    url: "https://cdn.jsdelivr.net/gh/morouter/luci-app-pm@main/README.md",
  },
  {
    id: "0fi",
    title: "FancyIndex-Theme",
    url: "https://cdn.jsdelivr.net/gh/moaeiou/0Fi@main/README.en.md",
  },
  {
    id: "contento24",
    title: "Contento24",
    url: "https://cdn.jsdelivr.net/gh/contento24/contento24@main/README.md",
  },
  {
    id: "mineradio",
    title: "Mineradio",
    url: "https://cdn.jsdelivr.net/gh/moaeiou/mineradio@main/README.md",
  },
  {
    id: "go-rustdesk-server",
    title: "Go Rustdesk Server",
    url: "https://cdn.jsdelivr.net/gh/moaeiou/go-rustdesk-server@main/README.md",
  },
  {
    id: "xavatarwall",
    title: "X(Twitter) Avatar Wall",
    url: "https://cdn.jsdelivr.net/gh/moaeiou/xavatarwall@main/README.md",
  },
];

const docs: RemoteEntry[] = [
  {
    id: "mirrors",
    title: "Resources mirrors",
    url: "https://cdn.jsdelivr.net/gh/moaeiou/moaeiou@main/docs/mirrors.md",
  },
  {
    id: "openwrt",
    title: "Anything about OpenWrt",
    url: "https://cdn.jsdelivr.net/gh/moaeiou/moaeiou@main/docs/openwrt.md",
  },
  {
    id: "mopl",
    title: "Mo Public License",
    url: "https://cdn.jsdelivr.net/gh/moaeiou/moaeiou@main/LICENSE.md",
  },
];

const mdLoader = (entries: RemoteEntry[]): Loader => ({
  name: "get-markdown",
  load: async (context: LoaderContext) => {
    const remoteEntries = await Promise.all(
      entries.map(async (entry) => ({
        entry,
        markdown: await getMd(entry.url),
      })),
    );

    for (const { entry, markdown } of remoteEntries) {
      const rendered = await context.renderMarkdown(markdown);
      const data = await context.parseData({
        id: entry.id,
        data: { title: entry.title },
      });
      context.store.set({ id: entry.id, data, rendered });
    }
  },
});

const entrySchema = z.object({ title: z.string() });

export const collections = {
  docs: defineCollection({
    loader: mdLoader(docs),
    schema: entrySchema,
  }),
  projects: defineCollection({
    loader: mdLoader(PROJECTS),
    schema: entrySchema,
  }),
  home: defineCollection({
    loader: mdLoader(HOME),
    schema: entrySchema,
  }),
};
