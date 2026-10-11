# Project instructions and work log

## Standing instruction

- Record all subsequent project work in this `AGENTS.md` file.
- After each task, update the log with the date, request, actions taken, decisions, results, and any outstanding work.
- Keep standing project rules and decisions in this file so future sessions can continue from them.
- Do not record passwords, access tokens, or other secrets.
- Keep entries concise and factual; revise earlier entries if a decision changes.
- Before declaring mobile UI changes complete, verify the actual interactive journeys (CTA -> destination, service selection, slot selection, booking creation, confirmation and cancellation) in addition to build/typecheck and UI hit-testing. Check browser runtime errors and, when possible, a non-HTTPS LAN origin and iOS Safari standalone mode. Clearly disclose when browser/device checks cannot be run; never claim unexecuted checks passed.

## Work log

### 2026-10-11

- **Request:** User instructed: «отныне записывай все в агентс мд».
- **Action:** Created `AGENTS.md` in the current workspace and added a persistent project log convention.
- **Status:** Active for subsequent work in this workspace.

- **Request:** Explain `interlark/parser-2gis` to a complete beginner for collecting different categories of auto repair shops.
- **Research:** Reviewed the repository README, current release (`v1.2.1`, published 2024-03-14), graphical-interface implementation, link generator, and project wiki.
- **Guidance:** Use the graphical release for the appropriate OS plus Google Chrome. In the main window click `...` next to URL, then `Сгенерировать`; select a country, city or cities, and one search term or rubric (for example, `автосервис`, `шиномонтаж`, `кузовной ремонт`, `автоэлектрик`). Repeat `Сгенерировать` for additional categories; the URLs accumulate. Choose `xlsx`, set a matching `.xlsx` output file via `Обзор`, click `Запуск`, and review the file in Excel. Alternatively paste 2GIS search URLs, one per line. The generator searches by rubric when one is selected and otherwise by keyword. CSV/XLSX contains business contacts, addresses, ratings, and 2GIS URLs when available, with duplicate removal enabled by default.
- **Caveat:** Last published standalone release is from 2024; current Chrome or 2GIS changes may affect parsing. Do a small test first. No scraper was installed or run in this session.

- **Request:** Continue creating `src/style.css` and verify the build from the current project state.
- **Actions:** Added `src/style.css` (549 lines) for the ATELIER DETAILING Vite/React app, covering public pages, booking flow, owner console, transitions, mobile breakpoints, and reduced-motion behavior. Ran `pnpm build` (`tsc -b && vite build`). Initial attempt could not find `node` on the shell `PATH`; reran with `/Users/seva/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` prepended to `PATH`.
- **Decisions:** Kept the existing React/TypeScript structure and implemented the missing stylesheet without introducing new dependencies.
- **Result:** Production build completed successfully (exit code 0); generated `dist/` with CSS, JavaScript, service worker, and PWA assets. Vite emitted nonblocking warnings about oversized chunks, `date-fns-tz` mixed import styles, and Rollup annotations in `zod`.
- **Outstanding:** Optional browser-based visual review and bundle-size optimization; neither blocks the build.

- **Request:** Fix `zsh: command not found: pnpm` when starting the site from the user's regular macOS Terminal.
- **Actions:** Confirmed `pnpm` and Node.js were only exposed through Codex's runtime PATH. Added executable `start.command` in the project root: it launches the installed Vite CLI directly with an available Node binary, without requiring `pnpm` in the user's Terminal. Prioritized the known-working Codex runtime Node after a ChatGPT-bundled Node attempt failed with a Rollup macOS code-signing conflict.
- **Result:** `./start.command` started Vite v7.3.7 at `http://localhost:5173/`; GET `/` returned HTTP 200. The development server was running when checked.
- **Outstanding:** Terminal's global `pnpm` command is still not configured; installing Node.js and pnpm separately is optional for users who want normal package-manager commands. Browser appearance and booking flows were not verified in this task.

- **Request:** Explain how to open the local development site on an iPhone.
- **Actions:** Checked the Mac's Wi-Fi address (`192.168.0.50`) and verified the Vite server responds with HTTP 200 on both `127.0.0.1:5173` and `192.168.0.50:5173`.
- **Guidance:** Connect iPhone and Mac to the same Wi-Fi and open `http://192.168.0.50:5173/` in iPhone Safari while the development server stays running. The local IP may change when networks change.
- **Result:** Server responds on the LAN address from the Mac; direct access from iPhone remains to be confirmed by the user.

- **Request:** Fix a blurred overlay covering the bottom navigation and preventing taps when the site is added to an iPhone home screen.
- **Diagnosis:** `src/main.tsx` initialized `liquid-gl` GPU rendering over `.mobile-bottom` and `.hero-liquid`; the delayed lens layer could obscure the underlying navigation links on iOS standalone Safari.
- **Actions:** Removed the GPU lens for the mobile bottom nav and skipped the hero GPU lens at viewports up to 760px, preserving CSS glass styling. Removed the obsolete `bottom-liquid` hook. Adjusted the mobile nav's stacking, button visibility, touch targets, safe-area offsets, and page bottom spacing.
- **Verification:** `pnpm build` completed successfully. In a 390×844 Chrome mobile emulation, all three nav links were visible and each had a clickable center (hit-testing); both tested navigation clicks reached `/services` and `/my`. The hero CTA text was visible.
- **Outstanding:** Confirm directly in iPhone Safari standalone mode after reloading the installed app; browser emulation does not fully reproduce iOS WebKit and service-worker caching.

- **Request:** Fix blank/black screen after pressing the main «Записаться» CTA on the iPhone; verify customer flows in future releases.
- **Diagnosis:** `BookingPage` called `crypto.randomUUID()` during render and again during service/slot selection. This browser API is gated to secure origins; the development site accessed from an iPhone at `http://192.168.0.50:5173` is a non-secure HTTP origin. Unhandled render exceptions can blank the React route. This is a strong static root-cause finding; direct reproduction in an automated browser was blocked by the execution platform.
- **Actions:** Added `src/uuid.ts` with Web Crypto `getRandomValues` v4 fallback and replaced all application `crypto.randomUUID()` calls, including demo bookings and owner operations. Added a route-level React error boundary with reload/home actions. Added Vitest checks for secure origin, LAN HTTP and legacy browser UUID generation, plus mobile Playwright smoke scenarios for CTA, service, bottom navigation, owner cabinet, booking and cancellation.
- **Verification:** `pnpm build` succeeded (`tsc -b && vite build`); 3 UUID unit tests passed (`vitest run src/uuid.test.ts`). Browser execution was rejected by the execution platform, so the new Playwright scenarios and real iPhone Safari/PWA mode are **not verified**.
- **Outstanding:** Run `pnpm test:e2e` and check the installed app on the actual iPhone when browser execution is available. On the phone, close and reopen the PWA so the updated Vite files load.

- **Request:** User explicitly authorized automatic Google Chrome launch on the Mac to finish mobile journey checks.
- **Actions:** Configured Playwright to use locally installed Google Chrome (`channel: 'chrome'`), avoiding an unavailable Playwright-managed Chromium binary. Updated the mobile booking test to accept an empty slot grid on closed days, and to book at least two calendar days ahead so cancellation respects the studio's 24-hour policy. Added `TEST_BASE_URL` configuration to exercise a real LAN HTTP origin without monkey-patching Web Crypto.
- **Verification:** `pnpm test:e2e` on loopback in Chrome mobile emulation passed **2/2** scenarios: main booking CTA, catalog, bottom navigation, demo owner cabinet, booking creation, confirmation and cancellation. The previous cancellation test failure was a valid domain-rule rejection for a booking less than 24 hours away, not a UI crash.
- **Limitation:** An additional run was started with `TEST_BASE_URL=http://192.168.0.50:5173`, but polling its completion was blocked by the execution platform; its outcome is **unconfirmed**. The automated tests use Chrome mobile emulation, not actual iOS Safari/PWA.
- **Outstanding:** Retrieve/redo LAN HTTP verification when execution allows; manually confirm real iPhone Safari and standalone app behavior.

- **Request:** Prepare the existing ATELIER DETAILING website for free public client previews using GitHub Pages, and explain how to publish it.
- **Actions:** Added `PAGES_BASE`-aware Vite configuration and hash-based routing for Pages project subpaths; prefixed tenant image URLs at render time; skipped root-scoped PWA registration during Pages builds while preserving local PWA behavior. Added `.github/workflows/pages.yml` to install dependencies, run unit tests, build, and deploy to Pages automatically on pushes to `main`. Added `GITHUB_PAGES.md` with GitHub Desktop steps, public URL format, demo limitations, and update workflow. Expanded `.gitignore` to exclude build caches and environment files. Limited Vitest discovery to `src/**/*.test.ts` because it previously tried to execute Playwright tests as Vitest tests. Initialized the local Git repository on `main`.
- **Verification:** `pnpm test` passed (3 tests); both regular `pnpm build` and `PAGES_BASE=/atelier-detailing/ pnpm build` passed with nonblocking bundle warnings. The Pages preview returned HTTP 200 for `/atelier-detailing/` and `/atelier-detailing/tenants/atelier/images/hero.jpg`. Generated HTML references CSS/JS under `/atelier-detailing/assets/`.
- **Limitation:** An attempted automated Chrome mobile booking/navigation smoke test was explicitly blocked by the platform before execution, so this version was not browser-verified. Prior local Chrome tests succeeded before the GitHub Pages changes, but do not establish post-change behavior.
- **Outstanding:** Publish the local `main` branch as a GitHub repository with GitHub Desktop, select `GitHub Actions` in Settings → Pages, confirm public URL and perform mobile browser verification. No remote repository, deployment, or live public URL has been created in this task.
