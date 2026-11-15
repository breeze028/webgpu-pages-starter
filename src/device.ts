// Kept separate so capability failure paths can be exercised without a GPU.
export async function createDevice(
  secure: boolean,
  gpu: GPU | undefined,
): Promise<GPUDevice> {
  if (!secure)
    throw new Error(
      "WebGPU requires a secure context. Use HTTPS or http://localhost for local development.",
    );
  if (!gpu)
    throw new Error(
      "This browser does not provide WebGPU. Use a compatible browser and check hardware acceleration, system support and graphics drivers.",
    );
  const adapter = await gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter)
    throw new Error(
      "No WebGPU Adapter is available. Check hardware acceleration, graphics drivers and browser GPU support.",
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
    throw new Error(`GPUDevice creation failed: ${String(error)}`);
  }
}
