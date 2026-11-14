# 实施与验证记录

记录日期：2026-11-15（Asia/Shanghai）。区分工程检查、真实浏览器观察、线上 HTTP 和用户人工验收。

## 技术选择与调研

TypeScript 7、Vite 8、WGSL、npm 和原生 WebGPU，无运行时 npm 依赖、渲染引擎或后端。版本以 package-lock 为准。机器默认 Node 20.11 低于 Vite 的 20.19 / 22.12 要求，因此临时解压官方 Node 24 LTS，与 CI Node 24 一致；未更改全局安装。

实际阅读 [nanite-webgpu](https://github.com/Scthe/nanite-webgpu) 的 README、package.json、esbuild-script.js、static/index.html、目录树和 [.github/workflows/main.yml](https://github.com/Scthe/nanite-webgpu/blob/master/.github/workflows/main.yml)：

- Yarn + esbuild 工程，web/Deno 入口分开；renderer、passes、scene、preprocessing、sys_web 等按职责组织。
- esbuild 把 `.wgsl` 当文本打包，复制 static 到 build；static 包含模型及 meshoptimizer/metis WASM，依赖还需处理部分 Node 内置模块。
- master 分支工作流构建 build，用第三方分支发布 Action 并创建 .nojekyll；HTML 相对引用 index.web.js。
- 本项目吸收静态产物完整、shader 进入 bundle、明确能力提示的工程经验，未复制原源码或算法。参考站点通过 HTTP 阅读过，未进行其 Nanite GPU 验收。

依据 [GitHub 官方 Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) 和 [Vite 最新部署说明](https://vite.dev/guide/static-deploy.html)，采用官方 artifact 发布，不创建 gh-pages 分支。两处文档展示的 Actions 主版本不完全一致，逐个通过官方仓库 tag 核实后固定 checkout v7、setup-node v7、configure-pages v6、upload-pages-artifact v5、deploy-pages v5 的 SHA。

## GPU 正确性约束

| 资源      | 布局 / usage                                                            | 生命周期与依赖                                       |
| --------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| instances | 1000 × 32 B，两个 vec4f；STORAGE / COPY_DST                             | 启动上传一次；半径 sqrt(3) × halfExtent              |
| cube      | 36 × 24 B，position + normal；VERTEX / COPY_DST                         | 程序化生成，外向 CCW                                 |
| frame     | 176 B，mat4 + 6 vec4 planes + vec4u；UNIFORM / COPY_DST                 | 每帧复用并 writeBuffer                               |
| visible   | 1000 × u32；STORAGE / COPY_SRC                                          | Compute 写，Vertex 读；atomic slot 唯一，最多 N 项   |
| indirect  | 16 B，四个 u32，第二项 atomic；STORAGE / INDIRECT / COPY_DST / COPY_SRC | dispatch 前写 [36,0,0,0]，firstInstance 保持 0       |
| readback  | 4 B；MAP_READ / COPY_DST                                                | 一个槽，最多每 250 ms 采样；map pending 时跳过新采样 |
| depth     | depth24plus                                                             | backing size 改变时重建，销毁旧贴图                  |

WebGPU 深度为 0..1：near plane 是 clip z，而不是 OpenGL 的 z+w。CPU 提取并归一化视锥平面；逐实例球体剔除、可见索引和 draw instanceCount 在 GPU 生成。同一 encoder 中结束 Compute Pass 后再 Render Pass，无需 CPU 同步。队列保证 reset → cull → draw → optional copy。不能在多个 workgroup 的同一 dispatch 内重置全局计数。

resize 受设备最大纹理尺寸约束，DPR 上限 2；页面离开销毁资源，bfcache 恢复重新初始化。初始化处理安全上下文、API 缺失、null Adapter、requestDevice 失败、WGSL 编译信息、异步 pipeline 错误和 validation scope；运行中处理 uncaptured error 与 device lost。失败停止渲染并显示重新加载入口。

## 构建与发布

`npm install` 开发安装；CI `npm ci` → `npm test` → `npm run verify:skill` → `npm run build`（含类型检查）→ 上传 dist → deploy-pages。支持 workflow_dispatch。Pages 为 `build_type: workflow`，API 确认 `https_enforced: true`。

Vite 从 PAGES_BASE_PATH 取值，workflow 使用 configure-pages.base_path，覆盖 Fork、改名、用户站与 custom domain。后备逻辑只在 Actions 下按 GITHUB_REPOSITORY 推导，本地默认 `/`。构建和 workflow 不硬编码用户名。

实际创建公开仓库 [breeze028/webgpu-pages-starter](https://github.com/breeze028/webgpu-pages-starter)，通过已有 Git 凭据创建并推送；凭据未写入项目、输出或 workflow。

首次验证 commit：`1b498692f2d548bc0b5b8fb8d38b0a2f5ccd20c0`，[Actions run 43615642366](https://github.com/breeze028/webgpu-pages-starter/actions/runs/43615642366) 的安装、测试、类型检查、构建、上传和部署全部成功。后续补充 Skill、文档、独立验证脚本与可测试的设备创建错误边界，没有改变 WGSL 或 GPU 剔除/绘制算法。最终 run 以下方交付核验为准。

## 实际问题与解决

1. **Node 过旧**：使用官方 Node 24 临时运行，不修改全局安装。
2. **初次 npm install 卡在无关可选 peer 解析**：检查 npm 日志后固定项目 .npmrc 的 legacy-peer-deps；无必需 peer 版本冲突。初次中断安装影响后续锁文件完整性。
3. **npm ci 报可选平台包在 lockfile 缺失**：涉及 lightningcss/rolldown 平台包。移走初次 node_modules 和锁文件，干净生成新锁，再实际 npm ci；Windows 与 Linux Actions 均成功。与 [npm 官方问题 #4828](https://github.com/npm/cli/issues/4828) 同类，不能仅改 CI 为 npm install。
4. **子路径预览拿到 HTML 而非 JS**：预览服务器读取了旧的根 base。用与 build 一致的 PAGES_BASE_PATH 重启 preview，HTML/JS/CSS 检查通过；检查脚本能检测 200 的 HTML fallback。
5. **Vite config 原生 loader 提示无扩展 import**：配置内本地 TS import 显式改为 `.ts`。
6. **初版立方体半尺寸超过网格间距一半**：收窄到 0.55–1.15，避免相邻重叠；随后生产浏览器 7/7 GPU 验证通过。
7. **独立测试错误要求 GLSL 固定 text MIME**：Vite preview 对未知扩展可以不发 Content-Type，fetch.text 仍合法；改为核对真实文本。WASM 仍检查 application/wasm 并实际编译字节。
8. **线上浏览器工具读取超时**：线上标签页显示正确标题，但 AX/DOM 连续超时；尝试受支持的普通浏览器后，工具因不能可靠确认 URL 停止控制。未关闭安全检查或换其他自动化通道绕过，线上 GPU/Console 保持未验证。

## 验证结果与边界

| 层级               | 结果              | 范围                                                                                            |
| ------------------ | ----------------- | ----------------------------------------------------------------------------------------------- |
| Windows 安装       | 通过              | npm install、干净 npm ci；执行时 audit 0 vulnerabilities                                        |
| 核心测试           | 4/4               | base、near/far/侧平面球体、顶点绕序/边界，以及模拟缺 API/null Adapter/device rejection          |
| 类型检查 / 构建    | 通过              | npm run typecheck / build；产物只有 HTML/JS/CSS                                                 |
| dev                | 真实浏览器通过    | 页面加载、实例绘制、FPS/可见数、Console 无 error/warn                                           |
| 生产子路径         | HTTP + 浏览器通过 | /webgpu-pages-starter/ 的 HTML/JS/CSS，WGSL 在 bundle 中                                        |
| GPU 正确性         | 真实 GPU 7/7      | 完整 visible 集合和四个 draw args 与 CPU oracle 一致；相机/aspect、关闭剔除、零可见、连续帧重置 |
| 交互               | 部分真实观察      | 关闭剔除计数 1000，World Normal 画面，方向键和距离滑条；无明显漏画                              |
| resize             | 浏览器通过        | backing 1076×829 → 342×420；390 px viewport 下继续渲染且计数更新                                |
| 发布               | 真实成功          | 官方 Actions build/deploy 成功，Pages HTTPS 启用                                                |
| 线上资源           | 通过              | HTTPS HTML 与两份 hashed JS/CSS 的状态、MIME、正文和子路径检查                                  |
| 线上 GPU / Console | **未验证**        | 浏览器工具超时/停止，不能由标题或 HTTP 推断实际渲染                                             |
| Skill 格式         | 通过              | skill-creator quick_validate，YAML name/description 合法                                        |
| Skill 临时项目     | 通过              | 新 Vite JS/WebGL + 无构建 JS 项目；独立 manifest/锁、npm ci/build，11 项 HTTP/资源检查          |
| 用户人工验收       | **未进行**        | Agent 观察不代替用户验收                                                                        |

URL 加 `?validate=1` 可重复 GPU 检查；CPU oracle 只用于测试，不提供正常绘制计数。测试回读会等待，正常帧循环不等待。FPS 不是 GPU 时间，未做跨设备性能承诺。

## Skill 与独立自检

`.agents/skills/webgpu-github-pages/` 含 SKILL.md、部署说明、症状排障表和通用 workflow。覆盖构建系统识别、artifact 根目录、base 元数据、shader/模型/纹理/worker/WASM 资源链、最小权限、Pages 首次启用、失败日志、GPU 能力和证据分层，不依赖立方体算法。

`npm run verify:skill` 在系统临时目录新建两份项目，不复制本示例 renderer/math/pages-base：

- `renamed-gl-lab`：Vite + JS/WebGL，不同仓库名，`site/` 输出；按部署参考配置 base，并将模板 artifact 改成 site。新锁文件后独立 npm ci/build，验证 HTML、hashed JS/CSS、运行时 GLSL、JSON 几何、SVG 和可编译 WASM。
- `plain-webgl`：无 package.json/构建系统，模块和 shader 用相对 URL，在 `/different-name/` 下检查 JS/GLSL/WASM。

共 11 项 HTTP 检查通过，fixture 和 result.json 保留于命令打印的临时目录。临时项目未进行真实浏览器 GPU 或第二份线上部署；不能据此宣称所有 WebGL/WASM 工程已验收。临时 WASM 是合法空模块，只覆盖 transport/MIME/编译，不覆盖 Emscripten glue 或线程。

## 限制

线上 GPU/Console、无 GPU 时真实错误界面、真实 device lost/驱动失败恢复、pointer drag/wheel/自动环绕/重置完整交互、Safari/Firefox/其他系统和显卡仍未完整验收。能力失败有模拟测试及静态错误 UI，不称为不支持浏览器已实测。

未实现 timestamp profiling、遮挡剔除、meshlets、Nanite、WASM 线程或后端。Pages COOP/COEP 限制已纳入 Skill，没有默认加入未经验证的 service worker 隔离方案。

## 交付核验

交付功能提交 `26d57c5a597195b4a19e5928348d21ffe51ef42a` 的 [Actions run 43617417460](https://github.com/breeze028/webgpu-pages-starter/actions/runs/43617417460) 已完成且为 success：Linux 上的 npm ci、4 项核心测试、独立 Skill fixture 自检、类型检查、构建、上传和 deploy 全部通过。

随后重新执行真实线上 `check:static`，HTML 与 `assets/index-C6xMnPME.js`、`assets/index-CjHthHDz.css` 均通过，和本地功能提交的产物名称一致。本文最后补记为文档修改；线上 GPU/Console 的未验证边界保持不变。Git 已推送 main，未提交 node_modules、dist、artifacts 或凭据。
