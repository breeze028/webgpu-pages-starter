import { INSTANCE_COUNT, INSTANCE_STRIDE } from "./scene";

type Kind = "scene" | "geometry" | "instance";
type Node = { id: string; name: string; kind: Kind; index?: number };
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

// UI owns layout/selection only. The renderer continues to own its camera,
// backing size, GPU buffers, timing and resource lifecycle.
export function initializeUi(data: Float32Array) {
  const nodes: Node[] = [
    { id: "scene", name: "Procedural cube field", kind: "scene" },
    { id: "cube", name: "Unit cube · shared geometry", kind: "geometry" },
    ...Array.from({ length: INSTANCE_COUNT }, (_, index): Node => ({
      id: `instance-${index}`,
      name: `Cube ${String(index).padStart(4, "0")}`,
      kind: "instance",
      index,
    })),
  ];
  const list = el("node-list"),
    rows = el("node-rows");
  const search = el<HTMLInputElement>("search");
  const filter = el<HTMLSelectElement>("type-filter");
  let filtered = nodes,
    selected = nodes[0],
    raw = false;
  const rowHeight = 48,
    overscan = 3;
  const icons = () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(svg.namespaceURI, "use");
    use.setAttribute("href", "#i-layers");
    svg.append(use);
    return svg;
  };
  function mountRows() {
    const first = Math.max(
      0,
      Math.floor(list.scrollTop / rowHeight) - overscan,
    );
    const end = Math.min(
      filtered.length,
      first + Math.ceil(list.clientHeight / rowHeight) + overscan * 2 + 1,
    );
    el("node-spacer").style.height = `${filtered.length * rowHeight}px`;
    rows.style.transform = `translateY(${first * rowHeight}px)`;
    const children = filtered.slice(first, end).map((node) => {
      const row = document.createElement("div");
      row.className = "node";
      row.id = `row-${node.id}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(selected.id === node.id));
      row.setAttribute("aria-posinset", String(filtered.indexOf(node) + 1));
      row.setAttribute("aria-setsize", String(filtered.length));
      const label = document.createElement("div"),
        title = document.createElement("span"),
        subtitle = document.createElement("small");
      title.textContent = node.name;
      subtitle.textContent =
        node.index === undefined
          ? node.kind === "scene"
            ? "Procedural · 1,000 instances"
            : "36 vertices · 12 triangles"
          : `x ${data[node.index * 8]} · z ${data[node.index * 8 + 2]}`;
      label.append(title, subtitle);
      row.append(icons(), label);
      row.onclick = () => {
        selectNode(node);
        list.focus();
        if (innerWidth < 1440) {
          setPanel("explorer", false);
          setPanel("properties", true);
          el(raw ? "raw-tab" : "structured-tab").focus();
        }
      };
      return row;
    });
    rows.replaceChildren(...children);
    const selectedRow = children.find((row) => row.id === `row-${selected.id}`);
    if (selectedRow) list.setAttribute("aria-activedescendant", selectedRow.id);
    else list.removeAttribute("aria-activedescendant");
    el("node-count").textContent =
      `${filtered.length.toLocaleString()} / ${nodes.length.toLocaleString()} nodes · ${children.length} mounted`;
    el("empty-list").hidden = filtered.length > 0;
  }
  function nodeData() {
    if (selected.kind === "scene")
      return {
        id: selected.id,
        type: selected.kind,
        source: "src/scene.ts · createInstances()",
        instances: INSTANCE_COUNT,
        geometry: "cube",
        trianglesPerInstance: 12,
        instanceStrideBytes: INSTANCE_STRIDE,
      };
    if (selected.kind === "geometry")
      return {
        id: selected.id,
        type: selected.kind,
        source: "src/scene.ts · createCube()",
        topology: "triangle-list",
        vertices: 36,
        triangles: 12,
        vertexStrideBytes: 24,
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
        references: { instances: INSTANCE_COUNT },
      };
    const i = selected.index!,
      values = Array.from(data.slice(i * 8, i * 8 + 8));
    return {
      id: selected.id,
      type: selected.kind,
      source: "src/scene.ts · createInstances()",
      instanceIndex: i,
      geometry: "cube",
      bufferOffsetBytes: i * INSTANCE_STRIDE,
      centerScale: values.slice(0, 4),
      colorRadius: values.slice(4, 8),
      transform: [
        values[3],
        0,
        0,
        0,
        0,
        values[3],
        0,
        0,
        0,
        0,
        values[3],
        0,
        values[0],
        values[1],
        values[2],
        1,
      ],
    };
  }
  function properties() {
    const value = nodeData();
    el("selected-name").textContent = selected.name;
    el("selected-type").textContent = selected.kind.toUpperCase();
    el("raw").textContent = JSON.stringify(value, null, 2);
    const target = el("structured");
    target.replaceChildren();
    const section = (name: string, fields: [string, unknown][]) => {
      const h = document.createElement("h4");
      h.textContent = name;
      const dl = document.createElement("dl");
      for (const [key, v] of fields) {
        const dt = document.createElement("dt"),
          dd = document.createElement("dd");
        dt.textContent = key;
        dd.textContent = typeof v === "string" ? v : JSON.stringify(v);
        dl.append(dt, dd);
      }
      target.append(h, dl);
    };
    section("Identity", [
      ["Stable ID", value.id],
      ["Type", value.type],
      ["Source", value.source],
    ]);
    if ("centerScale" in value) {
      section("Instance parameters", [
        ["Translation", value.centerScale!.slice(0, 3)],
        ["Half-extent", value.centerScale![3]],
        ["Color · linear", value.colorRadius!.slice(0, 3)],
        ["Sphere radius", value.colorRadius![3]],
      ]);
      section("References & storage", [
        ["Geometry", value.geometry],
        ["Byte offset", value.bufferOffsetBytes],
        ["Stride", `${INSTANCE_STRIDE} bytes`],
      ]);
      const details = document.createElement("details"),
        summary = document.createElement("summary"),
        pre = document.createElement("pre");
      summary.textContent = "Transform · column-major 4×4";
      pre.textContent = JSON.stringify(value.transform, null, 2);
      details.append(summary, pre);
      target.append(details);
    } else if ("vertices" in value) {
      section("Geometry", [
        ["Topology", value.topology],
        ["Vertices", value.vertices],
        ["Triangles", value.triangles],
        ["Vertex stride", `${value.vertexStrideBytes} bytes`],
        ["Bounds", value.bounds],
        ["References", value.references],
      ]);
    } else
      section("Scene", [
        ["Instances", value.instances],
        ["Geometry", value.geometry],
        ["Triangles / cube", value.trianglesPerInstance],
        ["Instance stride", `${value.instanceStrideBytes} bytes`],
      ]);
  }
  function selectNode(node: Node) {
    selected = node;
    properties();
    mountRows();
  }
  function updateFilter() {
    const term = search.value.trim().toLowerCase();
    filtered = nodes.filter(
      (node) =>
        (filter.value === "all" || node.kind === filter.value) &&
        `${node.name} ${node.id}`.toLowerCase().includes(term),
    );
    list.scrollTop = 0;
    mountRows();
  }
  search.oninput = filter.onchange = updateFilter;
  list.onscroll = mountRows;
  list.onkeydown = (event) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"];
    if (!keys.includes(event.key) || !filtered.length) return;
    event.preventDefault();
    const current = filtered.findIndex((node) => node.id === selected.id),
      page = Math.max(1, Math.floor(list.clientHeight / rowHeight));
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? filtered.length - 1
          : Math.max(
              0,
              Math.min(
                filtered.length - 1,
                current +
                  ({ ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page }[
                    event.key
                  ] ?? 0),
              ),
            );
    const top = next * rowHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + rowHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top + rowHeight - list.clientHeight;
    selectNode(filtered[next]);
  };
  const observer = new ResizeObserver(mountRows);
  observer.observe(list);
  window.addEventListener("pagehide", () => observer.disconnect(), {
    once: true,
  });
  function setRaw(value: boolean) {
    raw = value;
    el("raw").hidden = !raw;
    el("structured").hidden = raw;
    el("raw-tab").setAttribute("aria-selected", String(raw));
    el("structured-tab").setAttribute("aria-selected", String(!raw));
    el("raw-tab").tabIndex = raw ? 0 : -1;
    el("structured-tab").tabIndex = raw ? -1 : 0;
  }
  el("raw-tab").onclick = () => setRaw(true);
  el("structured-tab").onclick = () => setRaw(false);
  for (const id of ["raw-tab", "structured-tab"])
    el(id).onkeydown = (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        setRaw(event.key === "End" || (event.key !== "Home" && !raw));
        el(raw ? "raw-tab" : "structured-tab").focus();
      }
    };
  const openers: Record<string, string> = {
    explorer: "explorer-toggle",
    properties: "properties-toggle",
    settings: "settings-toggle",
    help: "help-toggle",
    diagnostics: "diagnostics-toggle",
  };
  const opened: string[] = [];
  function setPanel(id: string, show: boolean, restore = false) {
    if (show && ["explorer", "properties"].includes(id)) {
      for (const popover of ["settings", "help"]) setPanel(popover, false);
    }
    if (show && ["settings", "help"].includes(id)) {
      if (innerWidth < 1100) setPanel("explorer", false);
      if (innerWidth < 1440) setPanel("properties", false);
    }
    el(id).hidden = !show;
    el(openers[id]).setAttribute("aria-expanded", String(show));
    const position = opened.indexOf(id);
    if (position >= 0) opened.splice(position, 1);
    if (show) opened.push(id);
    if (id === "explorer")
      document.querySelector<HTMLElement>(".left-splitter")!.hidden = !show;
    if (id === "properties")
      document.querySelector<HTMLElement>(".right-splitter")!.hidden = !show;
    if (restore) el(openers[id]).focus();
  }
  for (const [id, opener] of Object.entries(openers))
    el(opener).onclick = () => {
      const show = el(id).hidden !== false;
      if (show && ["settings", "help"].includes(id))
        for (const other of ["settings", "help"])
          if (other !== id) setPanel(other, false);
      if (show && innerWidth < 1440 && ["explorer", "properties"].includes(id))
        setPanel(id === "explorer" ? "properties" : "explorer", false);
      setPanel(id, show);
      if (show) {
        if (id === "explorer") search.focus();
        else if (id === "properties")
          el(raw ? "raw-tab" : "structured-tab").focus();
        else el(id).querySelector<HTMLElement>("button")?.focus();
      }
    };
  for (const button of document.querySelectorAll<HTMLElement>("[data-close]"))
    button.onclick = () => setPanel(button.dataset.close!, false, true);
  function workspace(inspect: boolean) {
    document.body.dataset.mode = inspect ? "inspect" : "showcase";
    el("inspect").setAttribute("aria-pressed", String(inspect));
    el("showcase").setAttribute("aria-pressed", String(!inspect));
    for (const id of ["settings", "help", "explorer", "properties"])
      setPanel(id, false);
    if (inspect) {
      setPanel("explorer", true);
      if (innerWidth >= 1440) setPanel("properties", true);
    }
  }
  el("inspect").onclick = () => workspace(true);
  el("showcase").onclick = () => workspace(false);
  window.addEventListener("resize", () => {
    if (
      innerWidth < 1440 &&
      !el("explorer").hidden &&
      !el("properties").hidden
    ) {
      setPanel("properties", false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && opened.length) {
      const id = opened.at(-1)!;
      setPanel(id, false, true);
    }
    if (event.key === "Tab") {
      const id = opened.at(-1);
      if (
        !id ||
        !["explorer", "properties"].includes(id) ||
        innerWidth >= (id === "explorer" ? 1100 : 1440)
      )
        return;
      const panel = el(id);
      if (!panel.contains(document.activeElement)) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([tabindex="-1"]),input,select,[tabindex="0"]',
        ),
      ).filter((node) => !node.hidden);
      const first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  for (const [selector, variable, min, max] of [
    [".left-splitter", "--left-width", 220, 420],
    [".right-splitter", "--right-width", 260, 480],
  ] as const) {
    const splitter = document.querySelector<HTMLElement>(selector)!;
    const width = () => Number(splitter.getAttribute("aria-valuenow"));
    const apply = (value: number) => {
      const size = Math.max(min, Math.min(max, value));
      document.documentElement.style.setProperty(variable, `${size}px`);
      splitter.setAttribute("aria-valuenow", String(size));
    };
    splitter.onkeydown = (event) => {
      if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const direction = variable === "--left-width" ? 1 : -1;
        apply(width() + (event.key === "ArrowRight" ? 16 : -16) * direction);
      }
    };
    splitter.onpointerdown = (event) => {
      const start = event.clientX,
        initial = width();
      splitter.setPointerCapture(event.pointerId);
      splitter.onpointermove = (move) =>
        apply(
          initial +
            (move.clientX - start) * (variable === "--left-width" ? 1 : -1),
        );
    };
    splitter.onpointerup = splitter.onpointercancel = () => {
      splitter.onpointermove = null;
    };
  }
  el("fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el("workspace").requestFullscreen();
      el("ui-message").textContent = "";
    } catch {
      el("ui-message").textContent =
        "Fullscreen is unavailable in this browser or embedded host.";
    }
  };
  document.addEventListener("fullscreenchange", () =>
    el("fullscreen").setAttribute(
      "aria-label",
      document.fullscreenElement ? "Exit fullscreen" : "Toggle fullscreen",
    ),
  );
  properties();
  setRaw(false);
  mountRows();
  for (const id of [
    "showcase",
    "inspect",
    "settings-toggle",
    "help-toggle",
    "fullscreen",
    "diagnostics-toggle",
  ]) {
    el<HTMLButtonElement>(id).disabled = false;
  }
}
