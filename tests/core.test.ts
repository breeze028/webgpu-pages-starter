import { test } from "node:test";
import assert from "node:assert/strict";
import { pagesBase } from "../src/pages-base.ts";
import { frustumPlanes, sphereVisible, viewProjection } from "../src/math.ts";
import {
  createCube,
  createInstances,
  INSTANCE_COUNT,
  INSTANCE_STRIDE,
} from "../src/scene.ts";

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
