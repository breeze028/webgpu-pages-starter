# GPU Field · webgpu-pages-starter

原生 WebGPU 的 1,000 个程序化立方体：Compute Frustum Culling → 可见索引压缩 → GPU Indirect Arguments → `drawIndirect()`。TypeScript + WGSL + Vite，无运行时依赖、渲染引擎或后端。

## 本地运行

建议 Node.js 24 LTS；最低 Node 20.19 或 22.12。

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

浏览器需支持 WebGPU，开发使用 localhost，线上使用 HTTPS。拖动画布 / 方向键旋转，滚轮缩放；面板支持剔除开关、相机重置与实例颜色 / 世界法线切换。可见数来自每 250 ms 的异步 GPU 回读，FPS 是浏览器帧率；未采集 GPU 时间。

部署和完整验证正在进行；最终结果将记录在 `docs/implementation-notes.md`。
