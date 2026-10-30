// Explicit live test: creates only its own temporary test identity and deletes it.
// FCO_LIVE_ACCOUNT_TEST=1 node --import tsx tests/account-live.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { registrationIdentity } from '../src/account-identity.ts';
import { initialSave } from '../src/game.ts';

if (process.env.FCO_LIVE_ACCOUNT_TEST !== '1') throw new Error('Set FCO_LIVE_ACCOUNT_TEST=1 to run the temporary account lifecycle test.');
const config = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(line => line.startsWith('VITE_')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) }) } };
const client = createClient(config.VITE_SUPABASE_URL, config.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const identity = registrationIdentity(`fcoqa_${randomBytes(6).toString('hex')}`);
const password = `Qa!${randomBytes(24).toString('base64url')}`;
let created = false, deleted = false;
try {
  const signup = await client.auth.signUp({ email: identity.email, password, options: { data: { login_name: identity.name, display_name: 'FCO lifecycle QA' } } });
  assert.equal(signup.error, null, signup.error?.message);
  created = true;
  assert.ok(signup.data.session, 'Username signup must immediately return a session without email confirmation');
  const userId = signup.data.user.id;
  const save = await client.rpc('fco_commit_save', { p_data: initialSave(), p_revision: 0 });
  assert.equal(save.error, null, save.error?.message);
  assert.equal(save.data.data.cards.length, 0);
  await client.auth.signOut({ scope: 'local' });
  const wrong = await client.auth.signInWithPassword({ email: identity.email, password: `${password}wrong` });
  assert.ok(wrong.error, 'Wrong password must fail');
  const login = await client.auth.signInWithPassword({ email: identity.email, password });
  assert.equal(login.error, null, login.error?.message);
  assert.equal(login.data.user.id, userId);
  const loaded = await client.from('fco_game_saves').select('data').eq('user_id', userId).single();
  assert.equal(loaded.error, null, loaded.error?.message);
  assert.equal(loaded.data.data.cards.length, 0);
  const removed = await client.rpc('fco_delete_account');
  assert.equal(removed.error, null, removed.error?.message);
  assert.equal(removed.data.deleted, true); deleted = true;
  const leftover = await client.from('fco_game_saves').select('user_id').eq('user_id', userId);
  assert.equal(leftover.error, null, leftover.error?.message);
  assert.equal(leftover.data.length, 0, 'Deleting Auth user must cascade to cloud save');
  await client.auth.signOut({ scope: 'local' });
  const retry = await client.auth.signInWithPassword({ email: identity.email, password });
  assert.ok(retry.error, 'Deleted account must no longer sign in');
  console.log('PASS: username signup without email, empty inventory, wrong-password rejection, login, save reload, self-deletion, cascaded save removal, and deleted-account login denial. Temporary account removed.');
} finally {
  if (created && !deleted) {
    await client.auth.signInWithPassword({ email: identity.email, password });
    const cleanup = await client.rpc('fco_delete_account');
    if (cleanup.error) console.error(`Temporary test account cleanup failed: ${identity.name}`);
    else console.log('Temporary test account cleaned up.');
  }
}
