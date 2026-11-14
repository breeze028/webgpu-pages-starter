# 部署决策与配置

## 选择构建流程

| 仓库事实                   | 最小处理                                                           | artifact 目录                    |
| -------------------------- | ------------------------------------------------------------------ | -------------------------------- |
| Vite + TS/JS               | 保留 `vite.config.*`，合并 base；保留原有检查                      | 读取 `build.outDir`，默认 `dist` |
| esbuild / Rollup / webpack | 保留 entry、shader loader、复制插件；调整 public path 和运行时 URL | 读取构建配置，再实际构建确认     |
| 原生 HTML + JS             | 不强制 npm/Vite；保持相对 URL，专用静态目录内放完整资源            | 指向包含 `index.html` 的站点目录 |
| monorepo                   | 显式设置工作目录与 lockfile 的缓存路径                             | 相对仓库根的实际输出路径         |
| 需要服务器                 | 若工具链可静态导出，验证导出结果；否则说明 Pages 不适用            | 不把 server bundle 当静态站上传  |

没有 package-lock 的项目不要直接执行 `npm ci`；按项目已有锁文件选择包管理器。npm 项目生成并提交锁文件，且在干净目录验证 `npm ci`。构建阶段需要 devDependencies，不使用 `--omit=dev`。

## Vite base

将下面逻辑合并进已有配置，保留其他 plugins/options。环境变量是路径，不能含 origin；`configure-pages.base_path` 在根站是空串，所以在 workflow 中追加 `/`。

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

模板使用 Pages 元数据，比仅根据仓库名推断更适合已有 custom domain；域名变更后必须重新构建。若项目位于已发布站点的更深层子目录，以实际挂载 URL 为准。

PowerShell 下模拟项目站（build 与 preview 必须使用同一个变量）：

```powershell
$env:PAGES_BASE_PATH='/renamed-project/'
npm run build
npm run preview
# 浏览器打开终端显示的 /renamed-project/ URL
# 停止 preview 后：Remove-Item Env:PAGES_BASE_PATH
```

POSIX：`PAGES_BASE_PATH=/renamed-project/ npm run build`，再以同样变量运行 preview。改变构建 base 后重启预览服务，避免旧配置把请求回退到 HTML。

Vite 资源策略：

```ts
import shader from "./shader.wgsl?raw"; // WGSL/GLSL 文本进入 JS
const textureUrl = new URL("./texture.png", import.meta.url); // 源码旁资源
const modelUrl = `${import.meta.env.BASE_URL}models/scene.glb`; // public/models
const response = await fetch(modelUrl);
if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
```

public 内文件构建时复制到产物根，URL 中不带 `public/`。动态拼接不能总被打包器重写，尤其是 WASM glue 的 `locateFile`、worker 和模型引用的外部贴图，必须逐条验证。无构建 JS 用文档相对 URL 或模块 `import.meta.url`，不用 `import.meta.env`。

## 官方 Pages Actions

复制并适配 `../assets/deploy.yml`：

- `push.branches` 对齐实际部署分支；`workflow_dispatch` 保留手动发布。
- 使用项目兼容的 Node 和包管理器；根据真实 scripts 添加类型检查和测试。模板仅假设存在 `npm run build`。
- 配置 `configure-pages`，在 build 时注入 `${{ steps.pages.outputs.base_path }}/`。
- `upload-pages-artifact.path` 指向静态输出根。不要上传 `.git`、`.env`、node_modules 或整个私有源仓库。
- build/deploy 使用 `needs` 连接。deploy job 使用 `pages: write`、`id-token: write` 和 `github-pages` environment；build 只需读权限。
- 同一 Pages 站点串行部署；`cancel-in-progress: false` 避免打断正在部署的任务。可按团队既有约定调整。
- 无构建项目去掉 Node、cache、安装、构建步骤，保留 Pages 配置/上传/部署；相对路径无需 Vite base。
- PR 检查与生产部署分开，避免给未信任 PR 发布权限；不要为本任务添加高权限 `pull_request_target`。

仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。权限足够时可以通过 Pages REST API 设置 `build_type: workflow`。`configure-pages` 默认不会自动启用尚未配置的 Pages；不应为省一步设置向仓库加入 PAT。

若有 gh CLI 且已认证：

```sh
gh api repos/OWNER/REPO/pages
gh api --method POST repos/OWNER/REPO/pages -f build_type=workflow
gh run list --repo OWNER/REPO --commit COMMIT_SHA
gh run view RUN_ID --repo OWNER/REPO
gh run view RUN_ID --repo OWNER/REPO --log-failed
```

POST 只用于尚未启用 Pages 的仓库；已存在时读取后决定是否需要 PUT。模板不放长期 Token，Actions 使用自动生成的 `GITHUB_TOKEN`。环境保护规则仍可能要求仓库管理员或用户处理，不绕过保护。

## 成功判定

同一 commit 的 workflow 成功 → Pages API/部署输出确认 URL → HTTP 检查资源链 → 浏览器看实际渲染与 Console。记录这些证据分别对应哪个 commit。未来模板应用到 WebGL 项目时，验证真实 context 和 draw，不把 WebGPU API 的存在当作 WebGL 验收。

官方资料（执行时重新核对）：[Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Vite 静态部署](https://vite.dev/guide/static-deploy.html)、[Vite 资源处理](https://vite.dev/guide/assets.html)、[configure-pages](https://github.com/actions/configure-pages)。
