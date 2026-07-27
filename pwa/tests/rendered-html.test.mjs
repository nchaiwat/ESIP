import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("contains the ESIP application shell and no starter preview", async () => {
  const [page, app, layout, manifest] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/EsipApp.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("public/manifest.webmanifest", root), "utf8"),
  ]);

  assert.match(page, /<EsipApp \/>/);
  assert.match(app, /SCENARIO SIMULATION/);
  assert.match(app, /RAW PATH & UPDATE STATUS/);
  assert.match(app, /Authorize Matrix/);
  assert.match(app, /ONE VERSION OF THE TRUTH/);
  assert.match(layout, /ESIP Enterprise Intelligence/);
  assert.equal(JSON.parse(manifest).display, "standalone");
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)));
});

test("includes governed confirmation API controls", async () => {
  const [route, store] = await Promise.all([
    readFile(new URL("app/api/confirmations/route.ts", root), "utf8"),
    readFile(new URL("db/confirmation-store.ts", root), "utf8"),
  ]);

  assert.match(route, /Approval reference is required/);
  assert.match(route, /Administrator or Sale Admin permission is required/);
  assert.match(route, /Immediate apply must complete/);
  assert.match(store, /audit_events/);
  assert.match(store, /already been decided/);
  assert.match(store, /ADMINISTRATOR/);
  assert.match(store, /SALE_ADMIN/);
});
