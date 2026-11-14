import "./style.css";
import cullCode from "./shaders/cull.wgsl?raw";
import renderCode from "./shaders/render.wgsl?raw";
import {
  frustumPlanes,
  sphereVisible,
  viewProjection,
  type Vec3,
} from "./math";
import { createCube, createInstances, INSTANCE_COUNT } from "./scene";

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>("gpu-canvas");
const culling = element<HTMLInputElement>("culling");
const orbit = element<HTMLInputElement>("orbit");
const mode = element<HTMLSelectElement>("mode");
const distance = element<HTMLInputElement>("distance");
let device: GPUDevice | undefined;
let stopped = false;
let raf = 0;

function fail(error: unknown) {
  stopped = true;
  cancelAnimationFrame(raf);
  element("error").hidden = false;
  element("error-message").textContent =
    error instanceof Error ? error.message : String(error);
  element("status").textContent = "渲染已停止";
  element("status-dot").style.background = "#ef9d81";
  element("fps").textContent = "—";
  for (const control of [
    culling,
    orbit,
    mode,
    distance,
    element<HTMLButtonElement>("reset"),
  ])
    control.disabled = true;
  console.error(error);
}
element("retry").onclick = () => location.reload();

async function main() {
  if (!isSecureContext)
    throw new Error(
      "WebGPU 需要安全上下文。请使用 HTTPS，或通过 http://localhost 本地开发。",
    );
  if (!navigator.gpu)
    throw new Error(
      "此浏览器未提供 WebGPU。请使用支持 WebGPU 的新版浏览器，并检查硬件加速、系统和显卡驱动。",
    );
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter)
    throw new Error(
      "无法获取 WebGPU Adapter。请检查硬件加速、显卡驱动与浏览器的 GPU 支持状态。",
    );
  try {
    device = await adapter.requestDevice();
  } catch (error) {
    throw new Error(`创建 GPUDevice 失败：${String(error)}`);
  }
  const gpu = device;
  gpu.lost.then((info) => {
    if (!stopped)
      fail(
        new Error(
          `GPU Device Lost (${info.reason})：${info.message || "请重新加载页面。"}`,
        ),
      );
  });
  gpu.addEventListener("uncapturederror", (event) =>
    fail(new Error(`WebGPU 错误：${event.error.message}`)),
  );
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("无法创建 GPUCanvasContext。");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device: gpu, format, alphaMode: "opaque" });

  gpu.pushErrorScope("validation");
  const instanceData = createInstances();
  const cubeData = createCube();
  const buffer = (label: string, size: number, usage: GPUBufferUsageFlags) =>
    gpu.createBuffer({ label, size, usage });
  const instances = buffer(
    "instances: 1000 × 32B",
    instanceData.byteLength,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  );
  const vertices = buffer(
    "cube: 36 × 24B",
    cubeData.byteLength,
    GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  );
  const uniform = buffer(
    "frame: 64B matrix + 96B planes + 16B options",
    176,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  );
  const visible = buffer(
    "visible: 1000 × u32",
    INSTANCE_COUNT * 4,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  );
  const indirect = buffer(
    "drawIndirect args: 4 × u32",
    16,
    GPUBufferUsage.STORAGE |
      GPUBufferUsage.INDIRECT |
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC,
  );
  const readback = buffer(
    "sample: one asynchronous slot",
    4,
    GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  );
  gpu.queue.writeBuffer(instances, 0, instanceData);
  gpu.queue.writeBuffer(vertices, 0, cubeData);
  const modules = [
    gpu.createShaderModule({ label: "cull.wgsl", code: cullCode }),
    gpu.createShaderModule({ label: "render.wgsl", code: renderCode }),
  ];
  for (const module of modules) {
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((message) => message.type === "error");
    if (errors.length)
      throw new Error(
        `WGSL 编译失败：\n${errors.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join("\n")}`,
      );
  }
  const compute = await gpu.createComputePipelineAsync({
    label: "frustum culling",
    layout: "auto",
    compute: { module: modules[0], entryPoint: "main" },
  });
  const render = await gpu.createRenderPipelineAsync({
    label: "indirect cubes",
    layout: "auto",
    vertex: {
      module: modules[1],
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 12, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: { module: modules[1], entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "back" },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  });
  const bindings = [uniform, instances, visible, indirect].map(
    (item, binding) => ({ binding, resource: { buffer: item } }),
  );
  const computeGroup = gpu.createBindGroup({
    layout: compute.getBindGroupLayout(0),
    entries: bindings,
  });
  // Separate pass usages: compute writes visibility, vertex reads it. Do not bind
  // writable storage and indirect inputs together in the render pass.
  const renderGroup = gpu.createBindGroup({
    layout: render.getBindGroupLayout(0),
    entries: bindings.slice(0, 3),
  });
  const setupError = await gpu.popErrorScope();
  if (setupError)
    throw new Error(`Pipeline / Buffer 初始化失败：${setupError.message}`);

  let yaw = 0.64,
    pitch = 0.67,
    radius = 78;
  const reset = () => {
    yaw = 0.64;
    pitch = 0.67;
    radius = 78;
    orbit.checked = false;
    syncDistance();
  };
  function syncDistance() {
    distance.value = String(radius);
    element("distance-value").textContent = String(Math.round(radius));
  }
  element("reset").onclick = reset;
  distance.oninput = () => {
    radius = Number(distance.value);
    syncDistance();
  };
  let pointer: { id: number; x: number; y: number } | undefined;
  canvas.onpointerdown = (event) => {
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.focus();
  };
  canvas.onpointermove = (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    yaw -= (event.clientX - pointer.x) * 0.006;
    pitch = Math.max(
      0.12,
      Math.min(1.45, pitch + (event.clientY - pointer.y) * 0.006),
    );
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    pointer = undefined;
  };
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      radius = Math.max(
        22,
        Math.min(145, radius * Math.exp(event.deltaY * 0.001)),
      );
      syncDistance();
    },
    { passive: false },
  );
  canvas.onkeydown = (event) => {
    if (event.key.startsWith("Arrow")) event.preventDefault();
    if (event.key === "ArrowLeft") yaw -= 0.08;
    if (event.key === "ArrowRight") yaw += 0.08;
    if (event.key === "ArrowUp") pitch = Math.min(1.45, pitch + 0.06);
    if (event.key === "ArrowDown") pitch = Math.max(0.12, pitch - 0.06);
    if (event.key.toLowerCase() === "r") reset();
  };
  let depth: GPUTexture | undefined;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(
      1,
      Math.min(
        gpu.limits.maxTextureDimension2D,
        Math.round(canvas.clientWidth * dpr),
      ),
    );
    const height = Math.max(
      1,
      Math.min(
        gpu.limits.maxTextureDimension2D,
        Math.round(canvas.clientHeight * dpr),
      ),
    );
    if (depth && canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    depth?.destroy();
    depth = gpu.createTexture({
      label: "resizable depth",
      size: [width, height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    element("resolution").textContent = `${width} × ${height}`;
  }
  const frameData = new ArrayBuffer(176);
  const floats = new Float32Array(frameData);
  const options = new Uint32Array(frameData, 160, 4);
  const initialArgs = new Uint32Array([36, 0, 0, 0]);
  function encode(
    eye: Vec3,
    aspect: number,
    enabled: boolean,
  ): GPUCommandEncoder {
    const matrix = viewProjection(eye, aspect);
    floats.set(matrix, 0);
    floats.set(frustumPlanes(matrix), 16);
    options.set([INSTANCE_COUNT, Number(enabled), Number(mode.value), 0]);
    gpu.queue.writeBuffer(uniform, 0, frameData);
    // Reset outside compute. A workgroup barrier cannot reset a global atomic
    // before all workgroups. Queue order makes reset → dispatch → draw explicit.
    gpu.queue.writeBuffer(indirect, 0, initialArgs);
    const encoder = gpu.createCommandEncoder();
    const cull = encoder.beginComputePass();
    cull.setPipeline(compute);
    cull.setBindGroup(0, computeGroup);
    cull.dispatchWorkgroups(Math.ceil(INSTANCE_COUNT / 64));
    cull.end();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context!.getCurrentTexture().createView(),
          clearValue: [0.0706, 0.1059, 0.149, 1],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depth!.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    pass.setPipeline(render);
    pass.setBindGroup(0, renderGroup);
    pass.setVertexBuffer(0, vertices);
    pass.drawIndirect(indirect, 0);
    pass.end();
    return encoder;
  }

  // Opt-in real-GPU diagnostics. CPU reference is a test oracle only; it never
  // supplies the draw count or the normal live telemetry.
  async function validateGpu() {
    const results: object[] = [];
    const staging = buffer(
      "diagnostic indices + args",
      4016,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    );
    const cases: { eye: Vec3; aspect: number; enabled: boolean }[] = [
      { eye: [38, 45, 50], aspect: 1.6, enabled: true },
      { eye: [12, 9, 16], aspect: 0.65, enabled: true },
      { eye: [-65, 35, 15], aspect: 2.2, enabled: true },
      { eye: [0, 0, 220], aspect: 1, enabled: true },
      { eye: [38, 45, 50], aspect: 1.6, enabled: false },
      { eye: [0, 0, 300], aspect: 1, enabled: true },
      { eye: [12, 9, 16], aspect: 0.65, enabled: true },
    ];
    gpu.pushErrorScope("validation");
    for (const test of cases) {
      const encoder = encode(test.eye, test.aspect, test.enabled);
      encoder.copyBufferToBuffer(indirect, 0, staging, 0, 16);
      encoder.copyBufferToBuffer(visible, 0, staging, 16, 4000);
      gpu.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const words = new Uint32Array(staging.getMappedRange());
      const count = words[1],
        actual = Array.from(words.slice(4, 4 + count)).sort((a, b) => a - b);
      const planes = frustumPlanes(viewProjection(test.eye, test.aspect));
      const expected = Array.from(
        { length: INSTANCE_COUNT },
        (_, i) => i,
      ).filter(
        (i) =>
          !test.enabled ||
          sphereVisible(
            planes,
            [
              instanceData[i * 8],
              instanceData[i * 8 + 1],
              instanceData[i * 8 + 2],
            ],
            instanceData[i * 8 + 7],
          ),
      );
      const pass =
        words[0] === 36 &&
        words[2] === 0 &&
        words[3] === 0 &&
        count === expected.length &&
        actual.every((v, i) => v === expected[i]);
      results.push({ ...test, count, expected: expected.length, pass });
      staging.unmap();
      if (!pass)
        throw new Error(`GPU 剔除验证失败：${JSON.stringify(results)}`);
    }
    staging.destroy();
    const error = await gpu.popErrorScope();
    if (error) throw new Error(`GPU 验证错误：${error.message}`);
    const details = document.createElement("details");
    details.id = "gpu-validation";
    const summary = document.createElement("summary");
    summary.textContent = `真实 GPU 验证：${results.length}/${results.length} 通过（索引集合 + Indirect Arguments）`;
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(results, null, 2);
    details.append(summary, pre);
    document.querySelector("main")!.append(details);
    console.info("GPU validation passed", results);
  }
  resize();
  if (new URLSearchParams(location.search).has("validate")) await validateGpu();
  if (stopped) return;
  element("status").textContent = "WebGPU 就绪 · drawIndirect";
  let last = performance.now(),
    fpsStart = last,
    fpsFrames = 0,
    lastRead = -Infinity,
    busy = false;
  function frame(now: number) {
    if (stopped) return;
    try {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (orbit.checked) yaw += dt * 0.16;
      resize();
      const eye: Vec3 = [
        Math.sin(yaw) * Math.cos(pitch) * radius,
        Math.sin(pitch) * radius,
        Math.cos(yaw) * Math.cos(pitch) * radius,
      ];
      const encoder = encode(
        eye,
        canvas.width / canvas.height,
        culling.checked,
      );
      const shouldRead = !busy && now - lastRead >= 250;
      if (shouldRead) encoder.copyBufferToBuffer(indirect, 4, readback, 0, 4);
      gpu.queue.submit([encoder.finish()]);
      if (shouldRead) {
        busy = true;
        lastRead = now;
        const sampledMode = culling.checked;
        readback
          .mapAsync(GPUMapMode.READ)
          .then(() => {
            const value = new Uint32Array(readback.getMappedRange())[0];
            readback.unmap();
            busy = false;
            if (stopped) return;
            element("visible").textContent = value.toLocaleString();
            element("sample").textContent =
              `${sampledMode ? "剔除 ON" : "剔除 OFF"} · 250 ms`;
          })
          .catch((error) => {
            busy = false;
            if (!stopped) fail(new Error(`GPU 回读失败：${String(error)}`));
          });
      }
      fpsFrames++;
      if (now - fpsStart >= 500) {
        element("fps").textContent = String(
          Math.round((fpsFrames * 1000) / (now - fpsStart)),
        );
        fpsFrames = 0;
        fpsStart = now;
      }
      raf = requestAnimationFrame(frame);
    } catch (error) {
      fail(error);
    }
  }
  raf = requestAnimationFrame(frame);
  window.addEventListener(
    "pagehide",
    () => {
      stopped = true;
      cancelAnimationFrame(raf);
      for (const item of [
        instances,
        vertices,
        uniform,
        visible,
        indirect,
        readback,
      ])
        item.destroy();
      depth?.destroy();
      context.unconfigure();
      gpu.destroy();
    },
    { once: true },
  );
  // A bfcache restore needs fresh GPU resources after pagehide cleanup.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });
}
main().catch((error) => {
  fail(error);
  device?.destroy();
});
