// HTTP/resource smoke check, independent of GPU availability. Not a render test.
const target = new URL(process.argv[2] || "http://localhost:4173/");
if (!target.pathname.endsWith("/"))
  throw new Error("Provide the deployed directory URL with a trailing /.");
async function get(url, expectedType) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const type = response.headers.get("content-type") || "";
  if (!expectedType.test(type)) throw new Error(`Wrong MIME ${type}: ${url}`);
  return response.text();
}
const html = await get(target, /text\/html/);
const resources = [
  ...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g),
]
  .map((match) => match[1])
  .filter((path) => !path.startsWith("data:"));
if (resources.length < 2)
  throw new Error("Expected bundled JS and CSS. Is this a production build?");
for (const path of resources) {
  const url = new URL(path, target);
  if (
    url.origin !== target.origin ||
    !url.pathname.startsWith(target.pathname)
  ) {
    throw new Error(`Asset escaped the deployment base: ${url}`);
  }
  const body = await get(
    url,
    path.endsWith(".css") ? /text\/css/ : /(?:java|ecma)script/,
  );
  if (!body.length || /^\s*<!doctype html/i.test(body))
    throw new Error(`HTML fallback instead of asset: ${url}`);
  console.log(`OK ${url.pathname}`);
}
console.log(`PASS HTML + ${resources.length} resources: ${target}`);
