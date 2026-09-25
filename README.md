# 867678.xyz

Source code of 867678.xyz, MoITools, and CyAks.

## 🚀 How to init

Example using ArchLinux

```bash
sudo pacman -Syyuu --needed corepack nodejs
corepack use pnpm@latest
git clone git@github.com:moaeiou/867678.xyz.git
# or try https://github.com/moaeiou/867678.xyz.git
cd 867678.xyz
pnpm install
```

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                                      | Action                                               |
| :------------------------------------------- | :--------------------------------------------------- |
| `pnpm install`                               | Installs dependencies                                |
| `pnpm dev`                                   | Starts local dev server at `localhost:4321`          |
| `pnpm build`                                 | Build your production site to `./dist/`              |
| `pnpm astro ...`                             | Run CLI commands like `astro add`, `astro check`     |
| `pnpm astro -- --help`                       | Get help using the Astro CLI                         |
| `pnpm astro preferences *action* devToolbar` | enable or disable devToolbar                         |
| `pnpm format`                                | Format files with Prettier                           |
| `pnpm check`                                 | Run `astro check` and check formatting with Prettier |

## ⚠️ Warning

If your internet is not good, you may not be able to run `pnpm dev`.

To solve this problem, we use `cdn.jsdelivr.net`.

But it introduces a new problem: for speed, jsDelivr caches files and only refreshes them every 24 hours.

To solve this problem, we created a simple script.

Run `pnpm fresh` to run this script and refresh the CDN cache, so that the CDN gets the latest files.

## ⚖️ LICENSE

This website and the MoITools and CyAks projects are licensed under the [MoPL](https://867678.xyz/docs/mopl)

Included depends use theme license.
