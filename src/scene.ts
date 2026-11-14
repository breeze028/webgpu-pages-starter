export const INSTANCE_COUNT = 1000;
export const INSTANCE_STRIDE = 32;

export function createInstances(): Float32Array<ArrayBuffer> {
  const data = new Float32Array(INSTANCE_COUNT * 8);
  for (let i = 0; i < INSTANCE_COUNT; i++) {
    const x = ((i % 40) - 19.5) * 2.5,
      z = (Math.floor(i / 40) - 12) * 2.5;
    const scale = 0.55 + 0.6 * (0.5 + 0.5 * Math.sin(i * 13.37));
    const band = (Math.sin(x * 0.065 + z * 0.09) + 1) * 0.5;
    const color =
      band > 0.7
        ? [0.95, 0.48, 0.27]
        : [0.19 + band * 0.25, 0.56 + band * 0.22, 0.65 + band * 0.12];
    // center.xyz + uniform half-extent; color.rgb + bounding sphere radius.
    data.set([x, scale - 1.8, z, scale, ...color, Math.sqrt(3) * scale], i * 8);
  }
  return data;
}

export function createCube(): Float32Array<ArrayBuffer> {
  const result: number[] = [];
  const faces = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  for (const { n, u, v } of faces)
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ])
      result.push(...n.map((x, i) => x + a * u[i] + b * v[i]), ...n);
  return new Float32Array(result);
}
