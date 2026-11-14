struct Frame {
  viewProjection: mat4x4f,
  planes: array<vec4f, 6>,
  // total instances, enable culling, color mode, padding
  options: vec4u,
};
struct Instance { centerScale: vec4f, colorRadius: vec4f };
// Exactly the four u32 fields required by drawIndirect (16 bytes).
struct DrawArgs {
  vertexCount: u32,
  instanceCount: atomic<u32>,
  firstVertex: u32,
  firstInstance: u32,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
@group(0) @binding(2) var<storage, read_write> visible: array<u32>;
@group(0) @binding(3) var<storage, read_write> args: DrawArgs;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= frame.options.x) { return; }
  let instance = instances[i];
  if (frame.options.y != 0u) {
    for (var p = 0u; p < 6u; p++) {
      if (dot(frame.planes[p], vec4f(instance.centerScale.xyz, 1.0)) < -instance.colorRadius.w) { return; }
    }
  }
  // One invocation per instance => at most N writes into N slots.
  let slot = atomicAdd(&args.instanceCount, 1u);
  visible[slot] = i;
}
