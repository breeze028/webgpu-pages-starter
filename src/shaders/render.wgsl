struct Frame {
  viewProjection: mat4x4f,
  planes: array<vec4f, 6>,
  options: vec4u,
};
struct Instance { centerScale: vec4f, colorRadius: vec4f };
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
@group(0) @binding(2) var<storage, read> visible: array<u32>;
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) color: vec3f,
  @location(2) depth: f32,
};
@vertex fn vs(@location(0) position: vec3f, @location(1) normal: vec3f, @builtin(instance_index) index: u32) -> VertexOut {
  let instance = instances[visible[index]];
  let world = position * instance.centerScale.w + instance.centerScale.xyz;
  var out: VertexOut;
  out.position = frame.viewProjection * vec4f(world, 1.0);
  out.normal = normal;
  out.color = instance.colorRadius.xyz;
  out.depth = out.position.w;
  return out;
}
@fragment fn fs(in: VertexOut) -> @location(0) vec4f {
  let normal = normalize(in.normal);
  let lighting = 0.34 + 0.66 * max(dot(normal, normalize(vec3f(-0.5, 1.0, 0.4))), 0.0);
  var color = in.color * lighting;
  if (frame.options.z == 1u) { color = normal * 0.5 + 0.5; }
  let fog = smoothstep(65.0, 175.0, in.depth);
  return vec4f(mix(color, vec3f(0.0706, 0.1059, 0.1490), fog * 0.85), 1.0);
}
