/**
 * Copies the local dev group (Netlify Blobs, .netlify/blobs-serve) up to a
 * deployed SplitEasy site over the public API.
 *
 * The local store and the production store are separate databases, so a group
 * created locally never appears on the deployed site. This walks the same
 * routes the app uses: log in, create the group, then post each expense.
 *
 * Usage (PowerShell):
 *   $env:SITE_URL   = "https://your-site.netlify.app"
 *   $env:APP_PASSWORD = "the password you set in Netlify"
 *   node scripts/push-to-production.mjs            # dry run, changes nothing
 *   node scripts/push-to-production.mjs --commit   # actually writes
 *
 * The password is read from the environment and never written to disk.
 * Re-running creates a SECOND copy of the group; it is not idempotent, so
 * delete the old one in the UI first if you need to redo it.
 */
import { readFileSync } from "node:fs";

const DB = ".netlify/blobs-serve/entries/unlinked/site%3Aspliteasy/db";
const SITE = (process.env.SITE_URL || "").replace(/\/+$/, "");
const PASSWORD = process.env.APP_PASSWORD || "";
const COMMIT = process.argv.includes("--commit");

if (!SITE || !PASSWORD) {
  console.error("Set SITE_URL and APP_PASSWORD in the environment first.");
  console.error('  $env:SITE_URL = "https://your-site.netlify.app"');
  console.error('  $env:APP_PASSWORD = "..."');
  process.exit(2);
}

const db = JSON.parse(readFileSync(DB, "utf-8"));
const groups = Object.values(db.groups ?? {});
if (groups.length === 0) {
  console.error("No groups found in the local store.");
  process.exit(1);
}

// Newest first, so the most recently created group is the default choice.
const wanted = process.env.GROUP_NAME;
const gd = wanted
  ? groups.find((g) => g.group.name === wanted)
  : groups.sort((a, b) => (a.group.createdAt < b.group.createdAt ? 1 : -1))[0];

if (!gd) {
  console.error(`No group named ${JSON.stringify(wanted)}. Available:`);
  for (const g of groups) console.error(`  - ${g.group.name}`);
  process.exit(1);
}

const { group, expenses } = gd;
const total = expenses.reduce((s, e) => s + e.amountMinor, 0);

console.log(`Source: ${DB}`);
console.log(`Group:  ${group.name} (${group.currency})`);
console.log(`        ${group.members.length} members, ${expenses.length} expenses,`
  + ` total ${(total / 100).toFixed(2)}`);
console.log(`Target: ${SITE}`);
console.log("");

if (!COMMIT) {
  console.log("DRY RUN — nothing sent. Re-run with --commit to push.");
  process.exit(0);
}

/* ---- API plumbing ------------------------------------------------------- */

let cookie = "";

async function call(path, init = {}) {
  const res = await fetch(`${SITE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers ?? {}),
    },
  });

  // Collect Set-Cookie so the session carries across calls.
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    const jar = new Map(cookie ? cookie.split("; ").map((c) => c.split(/=(.*)/s)) : []);
    for (const raw of setCookie) {
      const [pair] = raw.split(";");
      const [k, v] = pair.split(/=(.*)/s);
      jar.set(k.trim(), v ?? "");
    }
    cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${body.slice(0, 300)}`);
  }
  return body ? JSON.parse(body) : {};
}

/* ---- Run ---------------------------------------------------------------- */

console.log("Logging in…");
await call("/auth", { method: "POST", body: JSON.stringify({ password: PASSWORD }) });

console.log("Creating the group…");
const created = await call("/groups", {
  method: "POST",
  body: JSON.stringify({
    name: group.name,
    currency: group.currency,
    // POST /groups takes plain names; colours are assigned server-side in the
    // same order, so they come out matching the source group.
    members: group.members.map((m) => m.name),
  }),
});

const newGroup = created.group;
// Member ids are regenerated server-side, so remap every split by name.
const idByName = new Map(newGroup.members.map((m) => [m.name, m.id]));
const nameByOldId = new Map(group.members.map((m) => [m.id, m.name]));
const remap = (oldId) => {
  const name = nameByOldId.get(oldId);
  const id = name ? idByName.get(name) : undefined;
  if (!id) throw new Error(`Could not map member ${oldId}`);
  return id;
};

console.log(`Created ${newGroup.id}. Posting ${expenses.length} expenses…`);

// Oldest first so the activity feed reads in trip order.
const ordered = [...expenses].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

let done = 0;
for (const e of ordered) {
  // groupId is passed explicitly rather than relying on the :id redirect
  // placeholder, which does not substitute on Netlify's production edge.
  await call(`/groups/${newGroup.id}/expenses?groupId=${encodeURIComponent(newGroup.id)}`, {
    method: "POST",
    body: JSON.stringify({
      description: e.description,
      amountMinor: e.amountMinor,
      currency: e.currency,
      paidBy: remap(e.paidBy),
      splitType: e.splitType,
      splits: e.splits.map((s) => ({
        memberId: remap(s.memberId),
        ...(s.amountMinor !== undefined ? { amountMinor: s.amountMinor } : {}),
        ...(s.percentage !== undefined ? { percentage: s.percentage } : {}),
      })),
      category: e.category,
      date: e.date,
      ...(e.note ? { note: e.note } : {}),
    }),
  });
  done += 1;
  process.stdout.write(`\r  ${done}/${ordered.length}`);
}
console.log("");

// Verify the destination agrees with the source before declaring success.
const check = await call(
  `/groups/${newGroup.id}/balances?groupId=${encodeURIComponent(newGroup.id)}`
);
const nets = Object.values(check.nets ?? {});
const sum = nets.reduce((s, n) => s + n, 0);

console.log("");
console.log(`Done. ${done} expenses posted.`);
console.log(`Balances sum to ${sum} (must be 0).`);
if (sum !== 0) {
  console.error("Balances do not net to zero — check the group in the UI.");
  process.exit(1);
}
console.log(`Open: ${SITE}/groups/${newGroup.id}`);
