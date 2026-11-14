import { test } from "node:test";
import assert from "node:assert/strict";
import { createDevice } from "../src/device.ts";
import { pagesBase } from "../src/pages-base.ts";
import { frustumPlanes, sphereVisible, viewProjection } from "../src/math.ts";
import {
  createCube,
  createInstances,
  INSTANCE_COUNT,
  INSTANCE_STRIDE,
} from "../src/scene.ts";

test("capability failures distinguish insecure context, missing API, adapter and device", async () => {
  await assert.rejects(createDevice(false, undefined), /HTTPS/);
  await assert.rejects(createDevice(true, undefined), /未提供 WebGPU/);
  const missingAdapter = { requestAdapter: async () => null } as unknown as GPU;
  await assert.rejects(createDevice(true, missingAdapter), /Adapter/);
  const failedDevice = {
    requestAdapter: async () => ({
      requestDevice: async () => {
        throw new Error("test driver failure");
      },
    }),
  } as unknown as GPU;
  await assert.rejects(
    createDevice(true, failedDevice),
    /GPUDevice.*test driver failure/,
  );
});

test("timestamp-query is requested only when supported and device rejection falls back", async () => {
  for (const supported of [false, true]) {
    const calls: GPUDeviceDescriptor[] = [];
    const expected = {} as GPUDevice;
    const adapter = {
      features: new Set(supported ? ["timestamp-query"] : []),
      requestDevice: async (descriptor: GPUDeviceDescriptor = {}) => {
        calls.push(descriptor);
        if (descriptor.requiredFeatures)
          throw new Error("optional profiling rejected");
        return expected;
      },
    };
    const gpu = { requestAdapter: async () => adapter } as unknown as GPU;
    assert.equal(await createDevice(true, gpu), expected);
    assert.equal(calls.length, supported ? 2 : 1);
    if (supported)
      assert.deepEqual(calls[0].requiredFeatures, ["timestamp-query"]);
    assert.equal(calls.at(-1)!.requiredFeatures, undefined);
  }
});

test("Pages paths cover rename, user sites, metadata and local preview", () => {
  assert.equal(pagesBase({}), "/");
  assert.equal(
    pagesBase({
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "someone/renamed-repo",
    }),
    "/renamed-repo/",
  );
  assert.equal(
    pagesBase({
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "Someone/someone.github.io",
    }),
    "/",
  );
  assert.equal(pagesBase({ PAGES_BASE_PATH: "/custom" }), "/custom/");
  assert.equal(pagesBase({ PAGES_BASE_PATH: "/" }), "/");
  assert.throws(() => pagesBase({ PAGES_BASE_PATH: "../bad" }));
});
test("WebGPU frustum includes near and far boundaries and sphere intersections", () => {
  const p = frustumPlanes(viewProjection([0, 0, 10], 1, 1, 20));
  assert.ok(sphereVisible(p, [0, 0, 0], 0));
  assert.ok(sphereVisible(p, [0, 0, 8.9], 0));
  assert.ok(!sphereVisible(p, [0, 0, 9.5], 0));
  assert.ok(sphereVisible(p, [0, 0, 9.5], 0.6));
  assert.ok(!sphereVisible(p, [0, 0, -11], 0));
  assert.ok(!sphereVisible(p, [20, 0, 0], 1));
  assert.ok(!sphereVisible(p, [0, 20, 0], 1));
});
test("procedural data obeys WGSL strides, bounds and outward winding", () => {
  const data = createInstances();
  assert.equal(data.byteLength, INSTANCE_COUNT * INSTANCE_STRIDE);
  for (let i = 0; i < INSTANCE_COUNT; i++)
    assert.ok(data[i * 8 + 7] >= Math.sqrt(3) * data[i * 8 + 3] - 0.000001);
  const cube = createCube();
  assert.equal(cube.length, 36 * 6);
  for (let i = 0; i < cube.length; i += 18) {
    const a = [
      cube[i + 6] - cube[i],
      cube[i + 7] - cube[i + 1],
      cube[i + 8] - cube[i + 2],
    ];
    const b = [
      cube[i + 12] - cube[i],
      cube[i + 13] - cube[i + 1],
      cube[i + 14] - cube[i + 2],
    ];
    const n = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    assert.ok(n[0] * cube[i + 3] + n[1] * cube[i + 4] + n[2] * cube[i + 5] > 0);
  }
});
