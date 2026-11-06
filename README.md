<a href="https://layerwise.app"><picture><source media="(prefers-color-scheme: dark)" srcset="https://layerwise.app/powered-by-dark.png"><img src="https://layerwise.app/powered-by.png" alt="Powered by Layerwise" width="174" height="28"></picture></a>

# Redline

Redline is a design review app for freelance designers and small studios. You
upload mockups and send your client one link. The client opens it without an
account, drops pins on the exact spot they want changed, and approves or
requests changes on a specific version. Your team can talk on the same pins with
internal comments the client never sees. You can also compare versions side by
side or with a slider, and follow new feedback in an Inbox.

On the [live demo](https://redline.layerwise.site/), visitors can pin comments on
a sample mockup right on the landing page. They can also open Try mode, which
runs the whole app (reviews, Inbox, settings, and the client's view) on sample
data kept in their own browser. Signing up creates a real workspace with real
uploads, share links, and email.

Redline was built with [Layerwise](https://layerwise.app), and you can open it in
Layerwise to make your own version.

## Make it your own

### Name, colors, fonts, and limits

`src/redline.config.ts` holds the product-level settings:

- `product`: the name and the description used for search and link previews
- `colors`: the accent used for pins, the ink, line, and paper colors, the
  internal-comment colors, and the canvas backgrounds
- `fonts`: the UI and mono font stacks. The fonts themselves are imported at the
  top of `src/styles/app.css`.
- `limits`: file size, PDF pages, storage per workspace, and text lengths
- `rateLimits` and `email`: how often guests can act, and how much email each
  workspace and review can send each day

The root route (`src/routes/__root.tsx`) turns the colors and fonts into CSS
variables, and `src/styles/app.css` maps them onto Tailwind and shadcn/ui
tokens. Each workspace also picks its own accent color and logo under
Settings. Its review pages use those instead of the default accent.

### Copy

- Landing page: `src/routes/index.tsx`. The page title and description are
  `TITLE` and `DESCRIPTION`, and the feature list is the `STEPS` array. Add a
  `[title, body]` pair to `STEPS` to add a feature.
- Try mode page title and description: `src/routes/try.tsx`
- Client review page and expired-link messages: `src/routes/r.$token.tsx`
- Email to clients and teammates: `src/domain/email-templates.ts`

### Sample content

The landing page and Try mode use the fictional studio, people, and reviews in
`src/sample/data.ts`. The landing page opens the review named by
`landingSample` at the end of that file. Try mode copies the sample into the
browser's `localStorage` (`src/client/demo.ts`). It never calls the server, so
it creates no real files, links, or email.

To add a sample review:

1. Add the mockup as HTML under `scripts/samples/`. Give each element you want a
   pin on a `data-pin="name"` attribute.
2. Add a block for it to `scripts/render-samples.mjs` and run
   `node scripts/render-samples.mjs`. This writes WebP images to
   `public/samples/` and pin positions to `scripts/samples/pins.json`.
3. Add the review to `reviews` in `sampleData()` in `src/sample/data.ts`. List
   each version's pages with their real pixel sizes. Place each pin's `x` and
   `y` inside its element's box from `pins.json` (`cx` and `cy` are the centre).

### Logo, icons, and share image

The logo is drawn in `public/logo.svg` and, for the page headers, in
`src/components/app/Logo.tsx`. Keep the two the same. `node scripts/render-logo.mjs`
renders `public/logo.svg` to `public/logo.png` and every favicon size. The
app's name in browsers' home-screen installs is in `public/site.webmanifest`.
The link-preview image is `public/og-image.png` (1200×630), set in
`src/lib/site.ts`.

## Commands

```bash
pnpm dev                                  # start the dev server
pnpm check-types                          # TypeScript
pnpm lint                                 # oxlint
pnpm test                                 # domain tests (Vitest)
pnpm test:e2e                             # browser tests (Playwright)
pnpm build                                # type check and production build
pnpm db:generate --name <migration_name>  # migration from src/db/schema.ts
pnpm db:migrate                           # apply migrations to the local database
pnpm auth:generate                        # generate Better Auth's schema
pnpm cf-typegen                           # regenerate Worker binding types
```

In Layerwise, the dev server is already running for you.

`db:migrate` applies generated Drizzle migrations to the local D1 database.
Layerwise applies the same migrations to the project's production D1 database
during publishing.

## Tests

```bash
pnpm test        # domain tests on real migrations (Vitest)
pnpm lint

pnpm exec playwright install chromium   # once per machine
pnpm test:e2e    # browser tests against the running preview (Playwright)
```

The browser tests use the dev server Layerwise logged in
`.layerwise/dev-server.log`, or `BASE_URL` if it's set. To use a Chromium of your
own, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. The render
scripts above honor it too.

The browser tests create real accounts and upload real files to project Storage.
They delete their workspaces when they pass; a failed run can leave test files.

## How it's built

Redline is a full-stack React app built with TanStack Start and deployed to
Cloudflare Workers. It uses Better Auth (email codes and passwords), a D1
database with Drizzle ORM, Layerwise Storage for uploads, Layerwise Email,
Tailwind CSS, and shadcn/ui.

## Important files

- `src/redline.config.ts`: product name, colors, fonts, limits, and rate limits
- `src/routes/`: TanStack Router file routes. `/` is the landing page, `/try` is
  Try mode, `/dashboard` is the signed-in app, and `/r/<token>` is the client's
  review link.
- `src/domain/`: review, comment, upload, and email rules, with access checks
- `src/server/`: server functions and request helpers around the domain
- `src/components/review/`: the canvas, shared by the team, guests, and Try mode
- `src/components/app/`: the signed-in app's shell, reviews list, Inbox, and
  Settings
- `src/client/demo.ts`: the browser-storage data behind Try mode and the landing
  page
- `src/sample/`: the sample studio and reviews
- `src/lib/auth.ts`: Better Auth server configuration
- `src/lib/auth.functions.ts`: the session lookup server function
- `src/db/schema.ts`: Drizzle schema
- `vite.config.ts`: Cloudflare, TanStack Start, React, Tailwind, and Layerwise
  plugins
- `wrangler.jsonc`: local Worker, D1, Storage, and Email bindings
- `src/lib/storage.ts`: Layerwise Storage types and helpers for `env.STORAGE`
- `src/lib/email.ts`: Layerwise Email types for `env.EMAIL`
- `src/lib/site.ts`: site name, share image, indexed address, and sitemap pages
- `src/utils/seo.ts`: `seo()` head tags for each route

## Storage

Server code stores files with `env.STORAGE` from `cloudflare:workers`. Files
are private by default; save keys (not URLs) in D1 and show private files with
`env.STORAGE.signedUrl(key)`. The local preview and the published app share the
project's one Storage, so files written while testing are real files.

## Search and sharing

Each route sets its head with `seo({ title, description, path })`, which adds
the canonical URL and the link-preview tags that Google, Instagram, iMessage,
and WhatsApp read. Signed-in and sign-in pages pass `noindex: true`.
`/robots.txt` and `/sitemap.xml` are generated from `src/lib/site.ts`; add each
public page to `sitemapPaths`. After connecting a custom domain, set `site.url`
to it so search engines index one address.

## Email

Server code sends transactional email with `env.EMAIL.send()` from
`cloudflare:workers`: one recipient per email, `html` and/or `text`, and an
optional `replyTo`. It returns `{ data, error }` and never throws for delivery
problems, so check `error.code`. The local preview never sends real email:
messages and sign-in codes appear under Email → Local in the Layerwise app.
Published apps send from the project's address after the first publish.

Keep secrets server-side. Variables prefixed with `VITE_` are included in the
browser bundle. `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `AUTH_EMAIL_URL`
belong in the Worker environment.
