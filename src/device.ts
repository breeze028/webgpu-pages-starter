// Kept separate so capability failure paths can be exercised without a GPU.
export async function createDevice(
  secure: boolean,
  gpu: GPU | undefined,
): Promise<GPUDevice> {
  if (!secure)
    throw new Error(
      "WebGPU 需要安全上下文。请使用 HTTPS，或通过 http://localhost 本地开发。",
    );
  if (!gpu)
    throw new Error(
      "此浏览器未提供 WebGPU。请使用支持 WebGPU 的新版浏览器，并检查硬件加速、系统和显卡驱动。",
    );
  const adapter = await gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter)
    throw new Error(
      "无法获取 WebGPU Adapter。请检查硬件加速、显卡驱动与浏览器的 GPU 支持状态。",
    );
  try {
    if (adapter.features?.has("timestamp-query")) {
      try {
        return await adapter.requestDevice({
          requiredFeatures: ["timestamp-query"],
        });
      } catch {
        // Profiling is optional; a plain device can still render the scene.
      }
    }
    return await adapter.requestDevice();
  } catch (error) {
    throw new Error(`创建 GPUDevice 失败：${String(error)}`);
  }
}
