# Deployment decisions and configuration

[简体中文](deployment.md) | English

| Repository             | Minimum adaptation                                                                            | Artifact directory                            |
| ---------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Vite + TS/JS           | Merge base into existing configuration and retain checks                                      | Inspect build.outDir; default dist            |
| esbuild/Rollup/webpack | Retain entry, shader loader, and copy plugins; adjust public/runtime URLs                     | Inspect config and actual output              |
| Native HTML/JS         | Keep relative URLs and a dedicated complete static directory; no mandatory npm/Vite migration | Directory containing index.html               |
| Monorepo               | Specify working directory and lockfile cache path                                             | Actual output relative to repository root     |
| Server application     | Verify a supported static export or explain Pages incompatibility                             | Never upload a server bundle as a static site |

Use the existing package manager and lockfile. Do not run `npm ci` without a package-lock. For npm projects, generate and commit the lock and verify a clean ci installation. Build tools require devDependencies; do not omit them during building.

## Vite base and assets

Merge this into the existing configuration, preserving plugins/options. The variable is a URL path, not an origin. configure-pages returns an empty base_path at the site root; the workflow appends `/`.

```ts
import { defineConfig } from "vite";
const [owner = "", repo = ""] = (process.env.GITHUB_REPOSITORY ?? "").split(
  "/",
);
const inferred =
  repo && repo.toLowerCase() !== `${owner}.github.io`.toLowerCase()
    ? `/${repo}/`
    : "/";
const base =
  process.env.PAGES_BASE_PATH ??
  (process.env.GITHUB_ACTIONS === "true" ? inferred : "/");
export default defineConfig({ base });
```

Pages metadata handles existing custom domains better than repository-name inference alone. Rebuild after domain changes; for deeper mounting paths use the actual public URL.

```powershell
$env:PAGES_BASE_PATH='/renamed-project/'
npm run build
npm run preview
# Open the printed /renamed-project/ URL.
# After stopping preview: Remove-Item Env:PAGES_BASE_PATH
```

On POSIX, prefix both commands with `PAGES_BASE_PATH=/renamed-project/`. Build/preview must use the same base; restart preview after changes to avoid HTML fallback from stale configuration.

```ts
import shader from "./shader.wgsl?raw";
const textureUrl = new URL("./texture.png", import.meta.url);
const modelUrl = `${import.meta.env.BASE_URL}models/scene.glb`;
const response = await fetch(modelUrl);
if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
```

Public files are copied to the output root, without `public/` in URLs. Dynamic paths may not be rewritten: verify WASM locateFile/glue, workers, and external model textures individually. Buildless JavaScript uses document-relative or module-relative URLs, not `import.meta.env`.

## Official Pages Actions

Adapt [the template](../assets/deploy.yml):

- Match push.branches to the deployment branch; retain workflow_dispatch.
- Choose compatible Node/package-manager versions and real existing check scripts; the template only assumes npm run build.
- Inject `${{ steps.pages.outputs.base_path }}/` during building.
- Point upload-pages-artifact.path at the static output root. Exclude .git, .env, node_modules, and unrelated/private source.
- Connect build/deploy using needs. Deploy requires pages:write, id-token:write, and github-pages environment; build uses read permissions.
- Serialize deployments to a site. cancel-in-progress:false avoids interrupting an active deployment; respect existing team conventions.
- For buildless sites remove Node/cache/install/build steps while retaining Pages configuration/upload/deploy. Relative URLs need no Vite base.
- Separate PR checks from production deployment; do not introduce privileged pull_request_target for this task.

Select Settings → Pages → Build and deployment → Source → **GitHub Actions**. With sufficient existing permissions, the Pages REST API can set build_type:workflow. configure-pages does not enable an unconfigured site by default; do not add a PAT simply to avoid this setup step.

```sh
gh api repos/OWNER/REPO/pages
gh api --method POST repos/OWNER/REPO/pages -f build_type=workflow
gh run list --repo OWNER/REPO --commit COMMIT_SHA
gh run view RUN_ID --repo OWNER/REPO
gh run view RUN_ID --repo OWNER/REPO --log-failed
```

POST is for a site not yet enabled; inspect existing state before considering PUT. Actions use the generated GITHUB_TOKEN, not a long-lived token in source. Respect environment protection rules.

Success requires the exact commit's workflow result, confirmed deployment URL, HTTP resource-chain checks, and actual browser rendering/Console evidence. Report each separately. For WebGL validate the real context/draw, not navigator.gpu.

Official references to recheck: [Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Vite deployment](https://vite.dev/guide/static-deploy.html), [Vite assets](https://vite.dev/guide/assets.html), [configure-pages](https://github.com/actions/configure-pages).
