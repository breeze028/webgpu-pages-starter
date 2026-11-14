# GPU Field · webgpu-pages-starter

[简体中文](README.md) | English

1,000 procedural cubes rendered with native WebGPU: compute frustum culling → visible-index compaction → GPU indirect arguments → `drawIndirect()`. TypeScript + WGSL + Vite, with no runtime npm dependencies, rendering engine, or backend.

[Live demo](https://breeze028.github.io/webgpu-pages-starter/) · [Deployment workflow](https://github.com/breeze028/webgpu-pages-starter/actions/workflows/deploy.yml) · [Implementation and evidence (Chinese)](docs/implementation-notes.md) · [Reusable Agent Skill](.agents/skills/webgpu-github-pages/SKILL.en.md)

## Run locally

Node.js 24 LTS is recommended; Vite requires Node 20.19+ or 22.12+.

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run preview
```

Use a WebGPU-capable browser with hardware acceleration, localhost for development, and HTTPS in production. Serve the site instead of opening HTML directly. Drag or use arrow keys to orbit; scroll or use the slider to zoom. The panel provides culling, automatic orbit, camera reset, and instance-color/world-normal modes. Press R while the canvas is focused to reset the camera.

FPS measures browser frame rate. Visible instance counts come from asynchronous GPU readback, sampled at most once per 250 ms and potentially lagging the current image. GPU time uses optional `timestamp-query`: the sum of compute and render pass durations, excluding queue wait, uploads, readback, and presentation. Unsupported devices display an explicit message and keep rendering. Timestamps may be quantized, so tiny workloads can read 0.000 ms; this is not a cross-device benchmark.

## Rendering and data layout

```text
CPU: upload instances once + update camera matrix / six normalized planes
       |
reset [36, 0, 0, 0] → Compute Culling (64 threads/workgroup)
                         |→ compact visible indices
                         |→ atomicAdd(indirect.instanceCount)
                                      |
                          Render Pass → drawIndirect() → Present
                                      |
                           optional asynchronous UI readback
```

Each instance contains two `vec4f` values (32-byte stride): center + half-extent, color + bounding-sphere radius. Frame uniforms use 176 bytes. Indirect arguments contain four u32 values (16 bytes); `firstInstance` stays zero, requiring no indirect-first-instance feature. At most N indices are written. Reset occurs before dispatch; separate compute/render passes let WebGPU manage dependencies. CPU code supplies camera planes, while per-instance visibility and draw counts are computed on the GPU.

Disabling culling still runs compute to emit every instance index and uses indirect drawing. Bounding-sphere culling is conservative and does not perform occlusion culling: the visible count can include hidden cubes. WGSL is bundled into JavaScript using `?raw`. No large assets or `public/` directory are needed.

Append `?validate=1` to a local or deployed URL to run seven real-GPU checks. These read the complete visible-index set and all four indirect arguments and compare them with a CPU test oracle, covering different cameras/aspects, culling disabled, zero visibility, and consecutive-frame resets. Diagnostic readbacks wait; normal rendering resumes afterward without waiting for telemetry. These checks are not performance tests.

## Project structure

```text
src/main.ts               GPU resources, passes, camera, UI, async readback
src/device.ts             Capability detection and device creation
src/math.ts, scene.ts     WebGPU 0..1 depth math and procedural data
src/pages-base.ts         Local/project/user-site base paths
src/shaders/              Compute and render WGSL
tests/core.test.ts        Core correctness tests
scripts/check-static.mjs Production HTML/JS/CSS HTTP/MIME/base checks
scripts/verify-skill.mjs Independent Vite and buildless fixture checks
.github/workflows/       Official Pages artifact deployment
.agents/skills/          Reusable skill, references, and workflow template
docs/implementation-notes.md
```

## Deploy to GitHub Pages

1. Fork or copy the repository, retaining `package-lock.json` and `.npmrc`.
2. In Settings → Pages → Build and deployment, select **GitHub Actions** as Source.
3. Push to `main`, or manually run **Deploy to GitHub Pages** in Actions.
4. The workflow runs `npm ci`, tests, independent skill checks, and the production build (including typechecking), then uploads `dist` and deploys it. The deploy job environment links to the result.
5. Open the real URL and inspect resources, Console, and rendering. A green workflow alone does not prove GPU rendering works.

The workflow uses official configure-pages/upload-pages-artifact/deploy-pages actions, with no gh-pages branch or manually supplied token. Deployment requires `pages: write` and `id-token: write`; the build job uses read permissions. Dependencies are locked and Actions use verified commit SHAs.

**Forks and repository renames:** no username or Vite configuration changes are needed. The workflow injects Pages `base_path` as `PAGES_BASE_PATH`. A fallback infers the project path from `GITHUB_REPOSITORY`; user/organization repositories named `<owner>.github.io` use `/`. Update the workflow branch and environment rules when changing the default branch. Custom domains use Pages metadata and require a fresh build; update the demo links in your README too.

Simulate a renamed project in PowerShell:

```powershell
$env:PAGES_BASE_PATH='/renamed-project/'
npm run build
npm run preview
# Open the printed /renamed-project/ URL; in another terminal:
npm run check:static -- http://127.0.0.1:4173/renamed-project/
# After stopping preview:
Remove-Item Env:PAGES_BASE_PATH
```

Build and preview must share the same base. Restart preview after changing it. On POSIX shells, prefix both commands with `PAGES_BASE_PATH=/renamed-project/`.

```sh
npm run check:static -- https://breeze028.github.io/webgpu-pages-starter/
npm run verify:skill
```

The latter creates and retains temporary projects with different repository names, a `site/` output directory, and GLSL/JSON/SVG/WASM resources. It validates installation, building, and HTTP delivery, not browser GPU rendering or another remote deployment.

## Troubleshooting and verification

- Blank page, 404, or JS MIME error: compare the real URL and base; a 200 response may contain HTML fallback. Inspect response bodies and preview the production subpath.
- WebGPU unavailable: check HTTPS, browser/system support, acceleration, and drivers. Switching browsers does not guarantee an adapter on every system.
- Shader/pipeline/device errors: the page displays the failure and stops rendering. WGSL compilation errors include line/column information; reload to recover from device loss.
- Optional platform packages missing from the lockfile: regenerate and verify the lock in a clean directory. Do not bypass CI checks. This project's `.npmrc` pins `legacy-peer-deps` for the observed npm/Vite optional-development-peer issue; do not apply that workaround indiscriminately to other projects.
- Pages configuration/permissions: select Actions as Source, then inspect the failed step, environment protection, and branch. A normal workflow token is not a replacement for initial administrator configuration.
- Models/WASM: public assets need `import.meta.env.BASE_URL`; inspect external textures and paths inside WASM glue. WASM threads require cross-origin isolation headers that Pages cannot freely configure. Use an existing single-threaded fallback or assess another host.

Local browser testing passed real rendering, production subpaths, resize, and 7/7 GPU culling checks. The new timer was also observed working locally (one sample: 0.066 ms), with 7/7 culling checks and no Console errors/warnings. Pages deployment and online static-resource checks passed for the earlier release, and the user confirmed that release renders correctly. That confirmation does not constitute a Console audit or online verification of the new timer; see the implementation notes for the current evidence boundary.

## Reuse the skill

Copy the complete `.agents/skills/webgpu-github-pages/` directory into another repository and ask the agent to deploy that WebGPU/WebGL project. [The English entry](.agents/skills/webgpu-github-pages/SKILL.en.md) links to English deployment and troubleshooting references; `SKILL.md` remains the discoverable canonical entry. Agents scanning only a user directory can use `~/.codex/skills/webgpu-github-pages/`. No starter renderer needs copying, and existing build systems can be retained.

References: [nanite-webgpu](https://github.com/Scthe/nanite-webgpu) for engineering organization/resources/deployment; [official Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages); [Vite deployment](https://vite.dev/guide/static-deploy.html); [WebGPU timestamp queries](https://gpuweb.github.io/gpuweb/#timestamp-query). The rendering implementation is independent and does not port Nanite.
