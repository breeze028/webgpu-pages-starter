export type Vec3 = [number, number, number];
const normalize = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n) as Vec3;
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function viewProjection(
  eye: Vec3,
  aspect: number,
  near = 0.2,
  far = 190,
): Float32Array<ArrayBuffer> {
  const z = normalize(eye); // Orbit target is the origin; right-handed view.
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  const view = [
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ];
  const f = 1 / Math.tan((55 * Math.PI) / 360);
  // WebGPU depth is [0, 1], unlike OpenGL's [-1, 1]. Column-major matrices.
  const p = [
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    far / (near - far),
    -1,
    0,
    0,
    (near * far) / (near - far),
    0,
  ];
  const result = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++)
        result[c * 4 + r] += p[k * 4 + r] * view[c * 4 + k];
  return result;
}

export function frustumPlanes(m: Float32Array): Float32Array<ArrayBuffer> {
  const row = (r: number) => [m[r], m[4 + r], m[8 + r], m[12 + r]];
  const r3 = row(3);
  // x+w, w-x, y+w, w-y, z, w-z (WebGPU near plane is z >= 0).
  const planes = [
    row(0).map((v, i) => v + r3[i]),
    row(0).map((v, i) => r3[i] - v),
    row(1).map((v, i) => v + r3[i]),
    row(1).map((v, i) => r3[i] - v),
    row(2),
    row(2).map((v, i) => r3[i] - v),
  ];
  return new Float32Array(
    planes.flatMap((p) => {
      const n = Math.hypot(...p.slice(0, 3));
      return p.map((v) => v / n);
    }),
  );
}

export function sphereVisible(
  planes: Float32Array,
  center: Vec3,
  radius: number,
): boolean {
  for (let i = 0; i < 24; i += 4)
    if (
      planes[i] * center[0] +
        planes[i + 1] * center[1] +
        planes[i + 2] * center[2] +
        planes[i + 3] <
      -radius
    )
      return false;
  return true;
}
