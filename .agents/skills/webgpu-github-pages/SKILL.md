---
name: webgpu-github-pages
description: 为现有 WebGPU、WebGL 或静态图形学网页添加 GitHub Pages 构建、资源路径处理、自动发布与分层验证。适用于 Vite/TypeScript、原生 JavaScript、WGSL/GLSL、模型、纹理和 WASM；保留原有构建系统。
---

# WebGPU / WebGL → GitHub Pages

简体中文 | [English](SKILL.en.md)（英文入口及部署、排障参考）。需要英文时读取英文入口，不必同时加载两套参考。

把当前项目变成可从 HTTPS URL 运行的静态站点，并用实际证据说明构建、发布、资源和 GPU 渲染分别是否成功。不要借部署任务替换渲染器、引入框架或重构无关代码。

## 先确认仓库事实

读取项目指令并检查 `git status`、当前分支、remote、默认分支与未提交修改。检查以下内容，再决定最小改动：

- 构建系统、锁文件、Node/包管理器版本、`package.json` 的真实命令；不凭名称猜输出目录。
- HTML entry 与实际构建输出；哪些文件需要构建、哪些直接复制。
- WGSL/GLSL 是字符串导入还是运行时 fetch；模型、纹理、WASM、worker、动态 import 的完整加载链。
- 根绝对路径、相对路径、`import.meta.url`、运行时拼接路径；文件名大小写是否适用于 Linux。
- 已有 Actions、Pages source、发布环境、custom domain / CNAME、仓库名、网站子目录；不要覆盖其他工作流。
- 是否依赖后端、Node 内置模块、秘密变量或必须的特殊 HTTP headers。

若依赖跨源隔离、WASM 线程或服务器逻辑，先判断纯静态发布是否可行。GitHub Pages 无法为每个项目自由配置 COOP/COEP 等响应头；提供现有的单线程回退，或说明需换托管方式。不要声称上传 `_headers` 文件就能解决。

## 实施

1. 运行项目原有检查和生产构建，确定 artifact 根目录内存在 `index.html`。保留已有工具链；其他构建系统及无构建项目见 [deployment.md](references/deployment.md)。
2. 按实际发布 URL 设置 base：项目站通常是 `/<repo>/`；用户/组织站和 custom domain 通常是 `/`。优先使用 `actions/configure-pages` 的 `base_path` 元数据，不硬编码用户名。手工模拟仓库子路径并打开生产预览，不能只测 dev server。
3. 修复资源加载。Vite 中优先使用导入、`new URL('./asset', import.meta.url)` 或 `import.meta.env.BASE_URL`。WGSL/GLSL 需要字符串时可 `?raw` 导入。不要把所有字符串路径批量改写，也不要将 Vite 专用写法复制到原生 JS。
4. 按 [部署说明](references/deployment.md) 适配 [官方 Actions 模板](assets/deploy.yml)。核实默认分支、working directory、安装方式、检查命令、输出目录、Node 版本及锁文件。当前官方 Actions 版本可能更新，使用时核对官方文档和 tag/SHA。
5. 用户已要求发布且权限可用时，推送、配置 Pages Source 为 GitHub Actions，并跟踪本次 commit 对应的 workflow 到终态。权限不够时完成本地改动并提供准确剩余操作；不要要求用户贴 Token，不创建额外授权范围。

## 验证与交付

- **工程检查**：干净安装、已有类型检查/必要测试、生产构建。命令必须实际存在并通过。未执行不写通过。
- **静态站点**：从正确 base 预览构建输出；检查 HTML、JS、CSS 以及运行时加载的 shader/模型/纹理/WASM/worker。核对状态、MIME 与响应内容；HTTP 200 的 HTML fallback 仍是资源错误。
- **真实浏览器**：查看 Console 与实际画面，测试相机、resize、交互、刷新和不支持时的错误提示。GPU 统计必须标明 CPU/GPU 来源；不支持 timestamp-query 时禁用对应统计，不影响普通渲染。
- **线上**：记录 commit、workflow URL、结果和真实 Pages URL；打开线上页面，重查资源和 Console。构建绿灯、HTTP 200、页面标题都不能单独证明 GPU 已渲染。
- **独立验证**：若改了通用模板，在一个不同名称的临时项目里检查 base、产物目录和资源链；不要复用原项目 renderer 来冒充通用性验证。

发生问题时按 [troubleshooting.md](references/troubleshooting.md) 的症状检查，不通过跳过检查、扩大权限或反复无依据重试掩盖失败。工具连续超时后尝试其受支持的另一检查方式；仍无法观察就标记未验证。

计时扩展应先检测 adapter 特性，再向 device 请求 `timestamp-query`；计时仅为可选功能，失败可回退普通 device。使用 pass timestampWrites、对齐的 resolve buffer 和异步回读，说明覆盖哪些 pass、单位转换及浏览器量化限制。用户确认的线上行为应明确归因用户，不自动升级为 Agent 的 Console 审计。

交付简洁 README 和实施记录：运行/发布命令、改名和自定义域名注意点、验证证据、失败原因及剩余限制。Skill 本身不授权创建新仓库、公开既有私有代码或更改访问范围；沿用当前用户的发布要求。
