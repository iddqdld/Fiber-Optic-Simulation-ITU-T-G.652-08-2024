I printed every file in the modes folder, but the command also printed binary `__pycache__` files. Repository inspections must exclude cache folders to keep the output readable.

I started the Vite check server inside the restricted sandbox, but local port binding failed with `EPERM`. The live browser check requires the approved unsandboxed development-server command.

I printed only the test exit code and tail, but the command returned a live session ID after its time slice. Printing and polling that session ID is required for long test suites.

I searched several project roots in one command, but the root `package.json` does not exist. The search still returned useful results, but a repository map or root manifest can prevent this path warning.

I tried to record the first issue with `yarn papercut`, but the repository has no root package manifest or `papercut` command. I recorded both issues directly so the required friction log is not lost.

I ran the contract generator, but `uv` tried to create a lock in the read-only home cache. Setting `UV_CACHE_DIR=/tmp/fiber-optics-uv-cache` is required in this workspace.

I selected focused Level 1 tests from memory, but `packages/physics_core/tests/level1/test_result.py` does not exist. A short test-layout map can prevent this mistaken path during scoped verification.

I ran the frontend lint gate for the Step 1 files, but ESLint stopped on three unchanged plot barrel exports. The React Refresh rule cannot verify their `export *` statements, so the gate reports unrelated false positives.

I used `npm --prefix apps/web exec` for a scoped ESLint run, but file patterns still resolved from the repository root. The command needs paths prefixed with `apps/web/` or an explicit frontend working directory.

I used the configured Playwright browser to verify the 3D bend flow, but its Firefox setup has `AllowWebgl2:false`. The browser verified controls, API data, and disclosures, but it cannot inspect the WebGL tube itself.

I reran React Doctor for changed files, but `npx` queried the npm registry again after it had already installed version 0.9.8. DNS failed with `EAI_AGAIN`, so the repeat needs the cached version in offline mode.

I tried the documented npm offline mode for React Doctor 0.9.8, but `npx` did not retain a usable registry cache entry. The project-local Doctor binary remains the reliable no-network fallback.

I ran Prettier through `npm --prefix apps/web exec`, but its file paths still resolved from the repository root. The command needs repository-relative paths or the `apps/web` working directory.

I tried to record this issue with `yarn papercut`, but the repository still has no root package manifest or `papercut` command. I added the entry directly so the friction record remains complete.

The isolated App ray-guidance test queried a lazy scene before its module loaded. The full file hid this order dependency because an earlier test warmed the import cache.

I patched the lazy App test with the wrong preview setup context. Read the local test block before applying a focused patch.

I changed the lazy-scene assertion to `findByTestId`, but fake timers stopped the query timeout. Load the lazy module inside `act` instead of timer-based polling.

The full frontend lint failed on existing React Refresh export-star errors in three unchanged plot files. Use changed-file lint for Phase C until the plot exports change.

I wrote Vitest JSON results for a failed full suite, but `jq` is not installed. Use the project Node runtime to read the report.

The full frontend suite found a shared mode-profile fixture mutation. The threshold test copied the intensity grid but still changed the original field grid.

The Vitest JSON report was not present after the run, and a broad `/tmp` search entered unreadable system-private directories. Use a repository-local path and a direct file check.

React Doctor completed its changed-file scan, but its score API was unreachable. The local diagnostic still reported the known `FibreGeometryView` size warning.

I checked the local preview ports with `ss`, but the restricted shell denied its netlink socket. Start the approved preview commands and use their bind result for port conflicts.

I waited for `Preview ready` in the live browser, but the page did not show that exact status within five seconds. Read the accessibility state before another text wait.

The browser check counted the React Three Fiber fallback text as visible, but its box was zero by zero while WebGL2 was active. Include layout dimensions in fallback checks.

I tried to record this issue with `yarn papercut`, but the repository still has no root package manifest or `papercut` command. I added the entry directly so the friction record remains complete.

I waited for a guessed pulse-completion phrase in Playwright, but the interface uses different status text. Read the live status before an exact text wait.

I changed into `apps/web` for a scoped lint run but kept an `apps/web` prefix on one search path. Use `src` paths after changing into the frontend directory.

React Doctor succeeded through the package script, but its changed-scope `npx` rerun queried npm again and failed with `EAI_AGAIN`. Use the project-local binary for repeat checks.

I inspected the Playwright MCP browser options, but `npx` queried npm and failed with `EAI_AGAIN`. The project browser cache contains only Firefox, so a Chrome WebGL check needs a browser download.

The cached Playwright CLI downloaded Chromium correctly, but it displayed a dependency warning because Playwright MCP owns the package outside the project manifest. The browser and MCP package still use matching Playwright versions.

Chromium crashed inside the restricted shell sandbox with `sandbox_host_linux` and `Operation not permitted`. The WebGL probe worked outside that sandbox, so Playwright MCP must launch Chromium from its normal MCP process.

The first Chromium application probe checked for the 3D canvas before the lazy scene appeared. Waiting for the canvas showed one active WebGL2 canvas and the existing `THREE.Clock` deprecation warning.

The Playwright MCP package exists in the npx execution cache, but npm offline mode reports `ENOTCACHED` because registry metadata is absent. The configured npx command still needs registry access after a Codex restart.

I tried to start Luna agents with `fork_context`, but custom agent types cannot inherit a full-history fork. Start Luna agents with a self-contained prompt and no fork.

I tried to record this issue with `yarn papercut`, but the repository still has no root package manifest or `papercut` command. I added the entry directly so the friction record remains complete.
I started two Luna audits with full-history context. The launcher rejects a custom agent role with `fork_context`, so Luna prompts must contain their own project context.

I tried to record the Luna launcher issue with `yarn papercut`, but the repository has no root package manifest or `papercut` command. I added both entries directly.
I checked the installed SciPy version with uv. The default uv cache is read-only in this workspace, so Python commands need `UV_CACHE_DIR=/tmp/fiber-optics-uv-cache`.
I added SciPy as a direct physics dependency with uv. Workspace resolution tried to fetch unrelated locked packages and failed because sandbox DNS access is disabled.
I added the scalar LP01 solver and its package export in one patch. The export list used a different order, so the patch failed before it changed either file.
I ran the first Phase D unit tests. One trend threshold exceeded the actual 80,862-fold ratio, and one fixture passed aggregate-only fields to the local model.
I added SciPy stubs for strict mypy checks. uv again resolved the full workspace and failed on sandbox DNS before it reached the requested package.
I added a guided-mode check to the frontend bend validator. A repeated guard pattern placed it in the input-array function, so I moved it to the result function.
I ran the full backend test suite with quiet output. The command showed four failures, but the captured output ended before every failure detail and final summary.
- 2026-08-09 — Running `npm --prefix apps/web exec -- prettier` used the web package binary but kept the repository root as the working directory. File arguments need repository-relative paths or an explicit `apps/web` working directory.
- 2026-08-09 — A combined `rg` check failed because its pattern mixed single and double shell quotes. Separate fixed-string searches avoid this easy-to-miss shell parsing error.
- 2026-08-09 — The live browser check found port 8124 already occupied by an API process, so a second uvicorn instance could not start. Check or reuse the existing local service before launch.
- 2026-08-09 — Vite failed to bind `127.0.0.1:5173` with `EPERM` inside the managed sandbox. The local browser check needs the approved development-server permission.
