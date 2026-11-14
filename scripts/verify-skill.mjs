// Independent fixture projects: no starter renderer/math/base implementation is copied.
// This validates build and HTTP resource transport, not browser/GPU rendering.
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { preview } from "vite";
import assert from "node:assert/strict";

const root = await mkdtemp(join(tmpdir(), "pages-skill-check-"));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function put(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const vertex = "attribute vec2 p; void main(){gl_Position=vec4(p,0.0,1.0);}";
const fragment =
  "precision mediump float; void main(){gl_FragColor=vec4(0.2,0.8,0.6,1.0);}";
const texture =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="#9dd" d="M0 0h2v2H0z"/></svg>';

const viteRoot = join(root, "renamed-gl-lab");
await put(
  join(viteRoot, "package.json"),
  JSON.stringify({
    name: "renamed-gl-lab",
    type: "module",
    scripts: { build: "vite build" },
    devDependencies: { vite: "^8.3.8" },
  }),
);
// This Vite/npm combination uses the same explicitly reviewed optional-peer
// workaround as the starter. Keep install and ci configuration consistent.
await put(join(viteRoot, ".npmrc"), "legacy-peer-deps=true\n");
await put(
  join(viteRoot, "vite.config.js"),
  `export default {base:process.env.PAGES_BASE_PATH??'/',build:{outDir:'site'}};`,
);
await put(
  join(viteRoot, "index.html"),
  '<html><head><link rel="stylesheet" href="./src/style.css"></head><body><canvas id="c"></canvas><p id="status">loading</p><script type="module" src="./src/main.js"></script></body></html>',
);
await put(
  join(viteRoot, "src/style.css"),
  "body { background:#112; color:white }",
);
await put(join(viteRoot, "src/vertex.glsl"), vertex);
await put(join(viteRoot, "public/shaders/fragment.glsl"), fragment);
await put(join(viteRoot, "public/texture.svg"), texture);
await put(
  join(viteRoot, "public/model.json"),
  JSON.stringify({ vertices: [-0.5, -0.5, 0.5, -0.5, 0, 0.5] }),
);
await put(join(viteRoot, "public/empty.wasm"), wasm);
await put(
  join(viteRoot, "src/main.js"),
  `
import vertex from './vertex.glsl?raw';
const base=import.meta.env.BASE_URL;
const gl=document.querySelector('#c').getContext('webgl');
try {
  if(!gl) throw Error('WebGL unavailable');
  const load=async path=>{ const r=await fetch(base+path); if(!r.ok) throw Error(r.status+' '+path); return r; };
  const fs=await (await load('shaders/fragment.glsl')).text();
  const model=await (await load('model.json')).json();
  await WebAssembly.instantiateStreaming(await load('empty.wasm'));
  const image=new Image(); image.src=base+'texture.svg'; await image.decode();
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=gl.createProgram(); gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex)); gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program); const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(model.vertices),gl.STATIC_DRAW);
  const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,3);
  document.querySelector('#status').textContent='WebGL drawn';
} catch(e){document.querySelector('#status').textContent=e.message;}
`,
);
// Copy template and adapt a non-default output directory, as the skill instructs.
const workflow = await readFile(
  join(repoRoot, ".agents/skills/webgpu-github-pages/assets/deploy.yml"),
  "utf8",
);
await put(
  join(viteRoot, ".github/workflows/deploy.yml"),
  workflow.replace("path: dist", "path: site"),
);
process.env.PAGES_BASE_PATH = "/renamed-gl-lab/";
function npm(args) {
  const npmEntry = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    resolve(
      dirname(process.execPath),
      "../lib/node_modules/npm/bin/npm-cli.js",
    ),
  ].find((path) => path && existsSync(path));
  const result = spawnSync(
    npmEntry ? process.execPath : "npm",
    npmEntry ? [npmEntry, ...args] : args,
    { cwd: viteRoot, encoding: "utf8", timeout: 55000 },
  );
  if (result.status !== 0)
    throw new Error(
      `Fixture npm ${args.join(" ")} failed: ${result.stderr}\n${result.stdout}`,
    );
}
npm(["install", "--package-lock-only", "--ignore-scripts"]);
npm(["ci"]);
npm(["run", "build"]);
const server = await preview({
  root: viteRoot,
  preview: { host: "127.0.0.1", port: 0, strictPort: false },
  logLevel: "warn",
});
const port = server.httpServer.address().port;
const origin = `http://127.0.0.1:${port}`;
const checks = [];
async function check(url, type, bodyCheck) {
  const response = await fetch(url);
  assert.equal(response.status, 200, url);
  assert.match(response.headers.get("content-type") ?? "", type);
  const bytes = await response.arrayBuffer();
  if (bodyCheck) await bodyCheck(bytes);
  checks.push(new URL(url).pathname);
  return new TextDecoder().decode(bytes);
}
try {
  const url = origin + "/renamed-gl-lab/";
  const html = await check(url, /html/);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
    (m) => m[1],
  );
  assert.equal(assets.length, 2);
  for (const asset of assets) {
    assert.ok(asset.startsWith("/renamed-gl-lab/assets/"));
    await check(
      origin + asset,
      asset.endsWith(".css") ? /css/ : /javascript/,
      (bytes) => assert.ok(!new TextDecoder().decode(bytes).startsWith("<!")),
    );
  }
  // fetch(...).text() does not require a text MIME; unknown shader extensions
  // may be served without Content-Type. Check actual source, not a guessed MIME.
  await check(
    url + "shaders/fragment.glsl",
    /^(?:text\/.*|application\/octet-stream)?$/,
    (bytes) => assert.equal(new TextDecoder().decode(bytes), fragment),
  );
  await check(url + "model.json", /json/, (bytes) =>
    assert.equal(
      JSON.parse(new TextDecoder().decode(bytes)).vertices.length,
      6,
    ),
  );
  await check(url + "texture.svg", /image\/svg/);
  await check(url + "empty.wasm", /application\/wasm/, (bytes) =>
    WebAssembly.compile(bytes),
  );
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
delete process.env.PAGES_BASE_PATH;

// Second fixture: buildless, relative resources, no Vite or package.json.
const plainRoot = join(root, "plain-webgl");
await put(
  join(plainRoot, "index.html"),
  '<canvas></canvas><script type="module" src="./app.js"></script>',
);
await put(
  join(plainRoot, "app.js"),
  `const gl=document.querySelector('canvas').getContext('webgl'); fetch(new URL('./shader.glsl',import.meta.url)); if(gl){gl.clearColor(.1,.2,.3,1);gl.clear(gl.COLOR_BUFFER_BIT);}`,
);
await put(join(plainRoot, "shader.glsl"), fragment);
await copyFile(
  join(viteRoot, "site", "empty.wasm"),
  join(plainRoot, "empty.wasm"),
);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".glsl": "text/plain",
  ".wasm": "application/wasm",
};
const plain = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/different-name/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const relative = pathname.slice("/different-name/".length) || "index.html";
    if (relative.includes("..")) throw Error("path");
    const content = await readFile(join(plainRoot, relative));
    res.writeHead(200, {
      "Content-Type": types[extname(relative)] ?? "application/octet-stream",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => plain.listen(0, "127.0.0.1", resolve));
try {
  const base = `http://127.0.0.1:${plain.address().port}/different-name/`;
  await check(base, /html/);
  await check(new URL("./app.js", base), /javascript/);
  await check(new URL("./shader.glsl", base), /text\/plain/);
  await check(new URL("./empty.wasm", base), /wasm/, (bytes) =>
    WebAssembly.compile(bytes),
  );
} finally {
  await new Promise((resolve) => plain.close(resolve));
}
const result = {
  fixtures: root,
  engineering: [
    "fresh manifest + lockfile",
    "npm ci",
    "npm run build",
    "workflow output adapted to site",
  ],
  checks,
  passed: checks.length,
  browserRendering: "not tested",
  remoteDeployment: "not performed for temporary fixtures",
};
await writeFile(join(root, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
