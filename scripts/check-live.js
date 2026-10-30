#!/usr/bin/env node
'use strict';
/**
 * Makes sure musicmetrics.net serves the site deployed by GitHub Actions.
 *
 * On 2026-10-25 Netlify built the old `main` branch by itself and published
 * it over the real site. Our deploys are the only ones titled "Charts update …"
 * (netlify deploy --message), so anything else in production is wrong.
 *
 *   node scripts/check-live.js verify "<deploy title>"
 *     After a deploy: the deploy with that title must be the published one
 *     (it is published if it is not) and the live /build.txt must match it.
 *   node scripts/check-live.js watch
 *     Between deploys: if production is not a "Charts update" deploy, the
 *     newest one is published again.
 *
 * Both turn Netlify's own Git builds off ("Stop builds") if they are on, and
 * report it only if that fails.
 * Exit code 1 = something was wrong (the workflow then opens an issue).
 * Env: NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID.
 */
const SITE_URL = 'https://musicmetrics.net';
const PREFIX = 'Charts update';
const { NETLIFY_AUTH_TOKEN: TOKEN, NETLIFY_SITE_ID: SITE } = process.env;

const problems = [];
const warnings = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Netlify API ${method} ${path}: HTTP ${res.status}`);
  return res.json();
}

const ours = (d) => (d.title || '').startsWith(PREFIX);
const describe = (d) => `${d.id} "${d.title || '(no title)'}" branch=${d.branch || '-'} ${d.published_at || d.created_at}`;

async function publish(deploy, why) {
  console.log(`Publishing ${describe(deploy)} (${why})`);
  await api('POST', `/sites/${SITE}/deploys/${deploy.id}/restore`);
  const site = await api('GET', `/sites/${SITE}`);
  if (site.published_deploy?.id !== deploy.id) throw new Error(`Could not publish ${deploy.id}`);
}

// The run id is in both the deploy title and /build.txt (written by the workflow).
async function checkLive(title) {
  const run = (title.match(/\(run (\d+)\)/) || [])[1];
  if (!run) return console.log('Deploy predates /build.txt; live file check skipped.');
  let last = '';
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${SITE_URL}/build.txt?t=${Date.now()}`, { cache: 'no-store' });
      last = res.ok ? await res.text() : `HTTP ${res.status}`;
      if (res.ok && last.includes(`run=${run}\n`)) return console.log(`Live ${SITE_URL}/build.txt matches run ${run}.`);
    } catch (e) { last = e.message; }
    await sleep(20000);
  }
  problems.push(`${SITE_URL}/build.txt does not show run ${run} (got: ${last.trim().slice(0, 120)})`);
}

// Netlify must never build from Git by itself: turn "Stop builds" on. If that
// fails it is an error after a deploy (once a day), only a warning in watch mode.
async function checkGitBuilds(site, mode) {
  const b = site.build_settings || {};
  if (!b.repo_url || b.stop_builds) return console.log('Netlify Git builds: ' + (b.repo_url ? 'stopped' : 'not linked') + '.');
  console.log(`Netlify can build from Git (${b.repo_url}, branch ${b.repo_branch || '?'}); stopping builds.`);
  try {
    await api('PATCH', `/sites/${SITE}`, { build_settings: { stop_builds: true } });
    if ((await api('GET', `/sites/${SITE}`)).build_settings?.stop_builds) return console.log('Netlify Git builds: stopped now.');
  } catch (e) { console.log(e.message); }
  (mode === 'verify' ? problems : warnings).push(`Netlify can still build from Git (${b.repo_url}, branch ${b.repo_branch || '?'}) and stopping it failed. ` +
    'Turn it off: Netlify → musicmetrics-net → Project configuration → Build & deploy → Continuous deployment → Build settings → Configure → Stop builds.');
}

async function main() {
  const [mode, title] = process.argv.slice(2);
  if (!TOKEN || !SITE) throw new Error('NETLIFY_AUTH_TOKEN / NETLIFY_SITE_ID are missing');
  if (!['verify', 'watch'].includes(mode) || (mode === 'verify' && !title)) {
    throw new Error('Usage: check-live.js verify "<deploy title>" | watch');
  }

  const site = await api('GET', `/sites/${SITE}`);
  const live = site.published_deploy || {};
  console.log(`Published: ${describe(live)}`);
  const deploys = await api('GET', `/sites/${SITE}/deploys?per_page=30`);

  if (mode === 'verify') {
    const mine = deploys.find((d) => d.title === title);
    if (!mine) throw new Error(`No deploy titled "${title}"`);
    if (live.id !== mine.id) {
      problems.push(`After deploying, production was ${describe(live)} instead of ${mine.id}; published ${mine.id}.`);
      await publish(mine, 'it was not the published deploy');
    }
    await checkLive(title);
  } else if (!ours(live)) {
    // A nightly deploy still uploading will publish (and verify) itself;
    // restoring an older one now could land on top of it.
    const uploading = deploys.find((d) => ours(d) && !['ready', 'error', 'rejected'].includes(d.state));
    const good = deploys.find((d) => d.state === 'ready' && d.context === 'production' && ours(d));
    // Re-read just before restoring, in case a nightly deploy finished meanwhile.
    const now = (await api('GET', `/sites/${SITE}`)).published_deploy || {};
    if (uploading) {
      problems.push(`Production is ${describe(live)}, not a "${PREFIX}" deploy; not restoring because ${describe(uploading)} is still ${uploading.state}.`);
    } else if (ours(now)) {
      console.log(`Production is now ${describe(now)}; nothing to restore.`);
    } else if (!good) {
      throw new Error(`Production is ${describe(live)} and no "${PREFIX}" deploy was found to restore`);
    } else {
      problems.push(`Production was ${describe(live)}, not a "${PREFIX}" deploy; restored ${describe(good)}.`);
      await publish(good, 'production was not ours');
      await checkLive(good.title);
    }
  } else {
    await checkLive(live.title);
  }

  await checkGitBuilds(site, mode);
}

main()
  .catch((e) => problems.push(e.message))
  .finally(() => {
    for (const w of warnings) console.log(`::warning::${w}`);
    if (!problems.length) return console.log('Live site OK.');
    for (const p of problems) console.log(`::error::${p}`);
    process.exitCode = 1;
  });
