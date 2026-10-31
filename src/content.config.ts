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
    url: "https://raw.githubusercontent.com/moaeiou/moaeiou/refs/heads/main/README.md",
  },
];

const PROJECTS: RemoteEntry[] = [
  {
    id: "mio",
    title: "mio protocol",
    url: "https://raw.githubusercontent.com/orgmio/mio/refs/heads/main/README.md",
  },
  {
    id: "mcry",
    title: "MCRY",
    url: "https://raw.githubusercontent.com/orgmio/mcry/refs/heads/main/README.md",
  },
  {
    id: "qcsh",
    title: "QUICShell",
    url: "https://raw.githubusercontent.com/orgmio/qcsh/refs/heads/main/README.md",
  },
  {
    id: "cv",
    title: "CV",
    url: "https://raw.githubusercontent.com/orgmio/cv/refs/heads/main/README.md",
  },
  {
    id: "omio",
    title: "older mio protocol",
    url: "https://raw.githubusercontent.com/orgmio/mio/refs/heads/omio/README.md",
  },
  {
    id: "luci-app-oplist",
    title: "LuCI-APP-OpenList",
    url: "https://raw.githubusercontent.com/morouter/luci-app-oplist/refs/heads/main/README.md",
  },
  {
    id: "luci-app-pm",
    title: "LuCI-APP-PowerManager",
    url: "https://raw.githubusercontent.com/morouter/luci-app-pm/refs/heads/main/README.md",
  },
  {
    id: "luci-app-rsop",
    title: "LuCI-APP-Rustdesk for OpenWrt",
    url: "https://raw.githubusercontent.com/morouter/luci-app-rsop/refs/heads/main/README.md",
  },
  {
    id: "0fi",
    title: "FancyIndex-Theme",
    url: "https://raw.githubusercontent.com/moaeiou/0Fi/refs/heads/main/README.md",
  },
  {
    id: "contento24",
    title: "Contento24",
    url: "https://raw.githubusercontent.com/contento24/contento24/refs/heads/main/README.md",
  },
  {
    id: "mineradio",
    title: "Mineradio",
    url: "https://raw.githubusercontent.com/moaeiou/mineradio/refs/heads/main/README.md",
  },
  {
    id: "go-rustdesk-server",
    title: "Go Rustdesk Server",
    url: "https://raw.githubusercontent.com/moaeiou/go-rustdesk-server/refs/heads/main/README.md",
  },
  {
    id: "xavatarwall",
    title: "X(Twitter) Avatar Wall",
    url: "https://raw.githubusercontent.com/moaeiou/xavatarwall/refs/heads/main/README.md",
  },
];

const DOCS: RemoteEntry[] = [
  {
    id: "mirrors",
    title: "Resources mirrors",
    url: "https://raw.githubusercontent.com/moaeiou/moaeiou/refs/heads/main/docs/mirrors.md",
  },
  {
    id: "openwrt",
    title: "Anything about OpenWrt",
    url: "https://raw.githubusercontent.com/moaeiou/moaeiou/refs/heads/main/docs/openwrt.md",
  },
  {
    id: "fuckxter",
    title: "FuckXter",
    url: "https://raw.githubusercontent.com/fuckxcorp/fuckxter/refs/heads/main/docs/README.md",
  },
  {
    id: "mopl",
    title: "Mo Public License",
    url: "https://raw.githubusercontent.com/moaeiou/moaeiou/refs/heads/main/LICENSE.md",
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
    loader: mdLoader(DOCS),
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
