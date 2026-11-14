# GPU Field · webgpu-pages-starter

简体中文 | [English](README.en.md)

原生 WebGPU 的 1,000 个程序化立方体：Compute Frustum Culling → 可见索引压缩 → GPU Indirect Arguments → `drawIndirect()`。TypeScript + WGSL + Vite，无运行时依赖、渲染引擎或后端。

## 本地运行

建议 **Node.js 24 LTS**；支持 Node 20.19+ 或 22.12+。

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

浏览器需支持 WebGPU，开发使用 localhost，线上使用 HTTPS。拖动画布 / 方向键旋转，滚轮缩放；面板支持剔除开关、相机重置与实例颜色 / 世界法线切换。可见数来自每 250 ms 的异步 GPU 回读，FPS 是浏览器帧率。GPU 时间使用可选的 `timestamp-query`，显示 Compute + Render Pass 耗时之和，不含排队、上传、回读和呈现；每 250 ms 最多一次异步采样。不支持时明确显示提示并继续渲染。浏览器时间戳可能量化，小负载可能显示 0.000 ms，不能当作跨设备基准。

[在线 Demo](https://breeze028.github.io/webgpu-pages-starter/) · [发布工作流](https://github.com/breeze028/webgpu-pages-starter/actions/workflows/deploy.yml) · [实施与验证记录](docs/implementation-notes.md) · [可复用 Agent Skill](.agents/skills/webgpu-github-pages/SKILL.md)

此前本地真实 WebGPU 渲染、生产子路径与 7 组 GPU 剔除检查已通过；GitHub Actions 发布和线上 HTML/JS/CSS 检查通过。用户已确认线上 Demo 正常工作；这不等于 Agent 完成了线上 Console 审计或新增 GPU 计时的验收，具体见实施记录。

`npm run typecheck` 单独做类型检查；`npm test` 覆盖数学、布局、base 和设备能力失败路径。键盘 R 在画布聚焦时重置相机；支持自动环绕。不要直接双击 HTML，应使用开发/预览服务器。

## 数据与渲染流程

```text
CPU: instance upload (once) + camera matrix / 6 normalized planes
              |
              v
reset [36, 0, 0, 0] → Compute Frustum Culling (64 threads/workgroup)
                           |
                           +→ visible indices [N × u32]
                           +→ atomicAdd(indirect.instanceCount)
                                        |
                           Render Pass → drawIndirect() → Present
                                        |
                         optional copy → async readback → UI (≤ 4 Hz)
```

实例为两个 `vec4f`，stride 32 B：`center.xyz + halfExtent`、`color.rgb + sphereRadius`。Frame uniform 为 176 B；间接参数为四个 u32，共 16 B，`firstInstance = 0`，无需 indirect-first-instance 特性。可见索引最多 N 项；每帧在 dispatch 前重置计数，Compute 和 Render 分 pass，由 WebGPU 管理依赖。CPU 只计算相机和视锥平面，实际逐实例剔除与绘制数量均由 GPU 决定。

关闭剔除时仍经 Compute 写入全部索引并间接绘制。球体测试是保守视锥剔除，不做遮挡剔除；可见数包含被其他立方体遮住的实例。WGSL 通过 `?raw` 打包进 JS。本示例没有大型资产，因此无需 `public/`。

在本地或线上 URL 后加 `?validate=1`，启动时执行 7 组真实 GPU 检查：回读完整索引集合和四个间接参数，比较 CPU 参考结果，包含全可见、零可见、窄视口、不同相机和连续帧重置。检查期间等待测试回读，完成后恢复普通异步渲染；这不是性能测试。

## 目录

```text
src/
  main.ts                 WebGPU 资源、pass、相机、UI、异步回读
  device.ts               能力检测和设备创建
  math.ts / scene.ts      WebGPU 0..1 深度矩阵、视锥、程序化数据
  pages-base.ts           本地/项目站/用户站 base
  shaders/                Compute 与 Render WGSL
tests/core.test.ts        可重复运行的核心测试
scripts/
  check-static.mjs        生产 HTML/JS/CSS 的 HTTP、MIME 和 base 检查
  verify-skill.mjs        独立 Vite / 无构建临时项目验证
.github/workflows/        官方 Pages artifact 发布
.agents/skills/           可复用部署 Skill、说明和模板
docs/implementation-notes.md
```

## GitHub Pages 发布

1. Fork / 复制到自己的仓库，保留 `package-lock.json` 和 `.npmrc`。
2. Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
3. 推送 `main`，或在 Actions 中手动运行 **Deploy to GitHub Pages**。
4. 工作流执行 `npm ci` → `npm test` → `npm run verify:skill` → `npm run build`（含类型检查）→ 上传 `dist` → 部署；成功 URL 在 deploy job 的 environment 中。
5. 打开真实 URL，检查资源、Console 和实际渲染；Actions 成功不等于浏览器 GPU 验收。

采用官方 `configure-pages`、`upload-pages-artifact`、`deploy-pages`；不维护 gh-pages 分支，无需手工配置 Token。deploy job 授予 `pages: write`、`id-token: write`，build 使用读权限。依赖和 Actions 固定在锁文件/已核实的 SHA 中。

**改仓库名或 Fork**：无需改用户名或 Vite 配置。工作流用 Pages 元数据设置 `PAGES_BASE_PATH`；缺少元数据时可根据 `GITHUB_REPOSITORY` 推导项目子路径，用户/组织站 `<owner>.github.io` 使用根路径。改默认分支时同步调整 `push.branches` 和 environment 规则。自定义域名以 Pages 配置为准，并重新构建；相应更新本 README 的在线链接。

PowerShell 下验证一个改名后的生产路径：

```powershell
$env:PAGES_BASE_PATH='/renamed-project/'
npm run build
npm run preview
# 打开终端显示的 /renamed-project/，另一个终端检查：
npm run check:static -- http://127.0.0.1:4173/renamed-project/
# 停止 preview 后恢复默认：
Remove-Item Env:PAGES_BASE_PATH
```

build 与 preview 必须使用同一 base；切换后重启 preview。线上检查与独立 Skill 检验：

```sh
npm run check:static -- https://breeze028.github.io/webgpu-pages-starter/
npm run verify:skill
```

后一命令创建并保留系统临时目录，独立项目使用不同仓库名、`site/` 输出和 GLSL/JSON/SVG/WASM 资源；执行安装、构建与 HTTP 验证，不进行临时项目的线上发布或 GPU 浏览器验证。

## 常见问题

- **白屏 / JS 404 / MIME 错误**：核对 URL 与 base；HTTP 200 也可能返回 HTML fallback。用生产子路径预览，检查响应正文。
- **WebGPU 不可用**：页面显示兼容性或设备错误。检查 HTTPS、浏览器支持、硬件加速和驱动；换浏览器不保证该系统一定能拿到 Adapter。
- **Shader/Pipeline/Device Lost**：页面显示原因并停止帧循环，可重新加载；WGSL 编译错误带行列号。设备丢失后不会静默继续绘制。
- **npm ci 缺可选平台包**：先检查 lockfile；在干净目录重新生成并验证锁文件，不靠跳过 CI 修复。本项目 `.npmrc` 固定 `legacy-peer-deps`，避免本次 npm/Vite 可选开发工具 peer 解析问题；无需复制此设置到所有项目。
- **Pages 配置或权限失败**：先设置 Source 为 Actions；检查失败 step、environment 保护和默认分支。普通 workflow Token 不承担首次管理员配置。
- **模型 / WASM 扩展**：public 资源使用 `import.meta.env.BASE_URL`，检查外部纹理和 WASM glue 内部路径。WASM 多线程需要跨源隔离 headers，Pages 不支持自由配置这些 headers；先用单线程版本或评估其他托管方式。

## 复用 Skill

将 `.agents/skills/webgpu-github-pages/` 整个目录复制到目标仓库同名位置，让 Agent 读取 `SKILL.md` 并执行「把当前 WebGPU / WebGL 项目发布到 GitHub Pages」。采用通用 YAML frontmatter；若 Agent 只扫描用户级目录，可复制到 `~/.codex/skills/webgpu-github-pages/`。无需复制本示例 renderer，支持保留其他构建系统。

参考：[nanite-webgpu](https://github.com/Scthe/nanite-webgpu)（工程组织与资源/发布方式）、[GitHub Pages 官方工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Vite 静态部署](https://vite.dev/guide/static-deploy.html)。渲染算法在本项目独立实现，未移植 Nanite。
