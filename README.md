# 867678.xyz

Source code of 867678.xyz, FuckXter, MoITools , CyAks.

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

## FuckXter API

FuckXter uses a separate Cloudflare Worker API. Configure the Worker origin
before building the frontend:

```dotenv
PUBLIC_FUCKXTER_API_URL=https://api.867678.xyz
```

The Worker must allow the frontend origin with credentials:

- `Access-Control-Allow-Origin`: the exact frontend origin
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Headers: Content-Type, X-Fuckxter-Client`
- `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`

Session cookies use `Secure`, `HttpOnly`, and `SameSite=Lax`. Run the Worker
locally with:

```bash
pnpm api:migrate:local
pnpm api:dev
```

Local development reads `FUCKXTER_SECRET` from `.dev.vars`.

Using an API subdomain such as `api.867678.xyz` is preferable to `workers.dev`,
because browsers increasingly restrict requests from a different site. If the
API must stay on `workers.dev`, authentication needs to switch from cookies to
bearer tokens.

## ⚖️ LICENSE

This web site and the 2rd project (moitools fuckxter and cyaks) aslo licensed under the [MoPL](https://867678.xyz/docs/mopl)

Included depends use theme license.
