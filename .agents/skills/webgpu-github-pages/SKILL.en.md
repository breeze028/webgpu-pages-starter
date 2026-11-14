---
name: webgpu-github-pages
description: Add GitHub Pages builds, resource-path handling, automatic deployment, and evidence-based verification to existing WebGPU, WebGL, or static graphics sites. Supports Vite/TypeScript, native JavaScript, shaders, models, textures, and WASM while retaining the existing build system.
---

# WebGPU / WebGL → GitHub Pages

[简体中文](SKILL.md) | English

Publish the current project as an HTTPS static site and report build, deployment, resource delivery, and actual GPU rendering as separate evidence. Do not replace the renderer, add frameworks, or refactor unrelated code merely to deploy it.

## Inspect repository facts

Read project instructions and inspect Git status, branch, remotes, default branch, and uncommitted changes. Determine:

- Build system, lockfile, Node/package-manager versions, and real package scripts. Inspect configuration and build output rather than guessing the output directory.
- HTML entry, compiled files, and copied static files.
- String-import versus runtime-fetch WGSL/GLSL; complete model/texture/WASM/worker/dynamic-import chains.
- Root-absolute, document-relative, module-relative, and dynamically assembled URLs; Linux filename casing.
- Existing workflows, Pages source, environment, domain/CNAME, repository name, and mounting path. Preserve unrelated workflows.
- Backend/Node dependencies, secrets, and required HTTP headers.

Assess static-host suitability before adapting projects that need server logic, WASM threads, or cross-origin isolation. Pages cannot freely configure COOP/COEP headers. Use an existing single-threaded fallback or explain the hosting limitation; uploading `_headers` does not solve this on Pages.

## Implement

1. Run existing checks and a production build. Confirm that the artifact root contains `index.html`. Keep the toolchain; see [deployment.en.md](references/deployment.en.md) for other build systems and buildless sites.
2. Configure the real base: project sites usually use `/<repo>/`; user/organization sites and custom domains usually use `/`. Prefer configure-pages `base_path` metadata, without hardcoding a username. Preview the production subpath, not just the dev root.
3. Fix actual resource chains. In Vite prefer imports, `new URL('./asset', import.meta.url)`, or `import.meta.env.BASE_URL`; `?raw` can bundle WGSL/GLSL strings. Avoid indiscriminate string replacement or Vite-only syntax in native JavaScript.
4. Adapt the [official Actions template](assets/deploy.yml) using the [deployment reference](references/deployment.en.md). Verify branch, working directory, installer, checks, artifact directory, Node version, and lockfile. Recheck current official action versions/tags/SHAs when applying it.
5. If the user requested publishing and permissions allow it, push, configure Pages Source as Actions, and follow the workflow for that exact commit to completion. Otherwise finish local work and state the precise remaining steps. Never ask the user to paste tokens or expand authorization.

## Verify and deliver

- **Engineering:** clean installation, existing typechecking/necessary tests, and production build. Do not claim checks that were not executed.
- **Static site:** verify HTML, JS, CSS, and runtime shaders/models/textures/WASM/workers under the correct base. Check status, appropriate MIME, and actual contents; HTTP 200 HTML fallback is still a resource failure.
- **Browser:** inspect Console and actual output; test camera, resize, interaction, refresh, and unsupported-browser messages. Label CPU/GPU statistics accurately. Timestamp queries are optional: detect and request the feature, measure the stated passes, resolve aligned query buffers, and read back asynchronously. Unsupported profiling must not prevent rendering. Document timestamp quantization and measurement scope; FPS is not GPU time.
- **Online:** record commit, workflow URL/result, and the real Pages URL; inspect online assets, Console, and actual rendering. Build success, HTTP 200, or a page title alone do not prove rendering.
- **Independent reuse:** test changed generic templates with a differently named temporary project, including base, output directory, and assets. Do not reuse the starter renderer as evidence of generality.

Use [troubleshooting.en.md](references/troubleshooting.en.md) for observed symptoms. Do not hide failures by skipping checks, broadening permissions, or retrying indefinitely. Try another supported observation method after tool timeouts; if unavailable, mark the result unverified. Attribute user-confirmed behavior to the user rather than converting it into an agent-observed Console audit.

Deliver a concise README and implementation record with run/deploy commands, rename/domain guidance, evidence, failures, and limits. This skill itself does not authorize a new repository, public disclosure of existing private code, or access changes; follow the user's current publishing scope.
