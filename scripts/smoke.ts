// Smoke-test a deployed (or locally previewed) build of the web app.
//
//   node scripts/smoke.ts <url>
//
// Fetches the page, follows its module script and stylesheet, and checks that
// every tool made it into the bundle. Retries while the server comes up, so it
// works both against `vite preview` that was just started and against GitHub
// Pages right after a deploy.

/** Nav ids from src/tools/index.ts; each must appear in the built JS. */
const TOOL_IDS = [
  "enemy-level-skip",
  "thorn-calculator",
  "golden-bot-sniper",
  "themes-vs-golden-bot",
  "submod-reroll",
  "battle-report-stats",
];

const ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS ?? 12);
const DELAY_MS = Number(process.env.SMOKE_DELAY_MS ?? 5000);

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`✓ ${message}`);
}

async function get(url: URL): Promise<{ status: number; type: string; body: string }> {
  const response = await fetch(url, { redirect: "follow", cache: "no-store" });
  return { status: response.status, type: response.headers.get("content-type") ?? "", body: await response.text() };
}

/** Retry the page fetch while the server is still starting or the deploy is propagating. */
async function getPage(url: URL) {
  let lastError = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const page = await get(url);
      if (page.status === 200) return page;
      lastError = `HTTP ${page.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < ATTEMPTS) {
      console.log(`  waiting for ${url} (${lastError}), attempt ${attempt}/${ATTEMPTS}`);
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }
  return fail(`${url} did not respond with 200 after ${ATTEMPTS} attempts (${lastError})`);
}

function attr(html: string, tag: string, attribute: string, filter: RegExp): string[] {
  const matches = html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"));
  const values: string[] = [];
  for (const [element] of matches) {
    if (!filter.test(element)) continue;
    const value = element.match(new RegExp(`\\b${attribute}="([^"]+)"`))?.[1];
    if (value) values.push(value);
  }
  return values;
}

async function main() {
  const target = process.argv[2];
  if (!target) fail("usage: node scripts/smoke.ts <url>");
  const pageUrl = new URL(target);

  const page = await getPage(pageUrl);
  ok(`${pageUrl} responds with 200`);
  if (!page.body.includes("<title>Tower Tools</title>")) fail("page title is missing");
  ok("page title is present");
  if (!page.body.includes('id="root"')) fail("root element is missing");
  ok("root element is present");

  const scripts = attr(page.body, "script", "src", /type="module"/);
  if (scripts.length === 0) fail("no module script found in the page");
  for (const src of scripts) {
    const url = new URL(src, pageUrl);
    const script = await get(url);
    if (script.status !== 200) fail(`${url} responded with ${script.status}`);
    if (!script.type.includes("javascript")) fail(`${url} is not JavaScript (${script.type})`);
    ok(`module script ${url.pathname} loads`);
    const missing = TOOL_IDS.filter((id) => !script.body.includes(id));
    if (missing.length > 0) fail(`bundle is missing tools: ${missing.join(", ")}`);
    ok(`bundle contains all ${TOOL_IDS.length} tools`);
  }

  const styles = attr(page.body, "link", "href", /rel="stylesheet"/);
  for (const href of styles) {
    const url = new URL(href, pageUrl);
    const style = await get(url);
    if (style.status !== 200) fail(`${url} responded with ${style.status}`);
    ok(`stylesheet ${url.pathname} loads`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
