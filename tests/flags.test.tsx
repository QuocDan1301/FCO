import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Flag, flagImageUrl } from '../src/flags.tsx';
import { players } from '../src/game.ts';

test('Every player has an embedded flag shared by the reveal and LED, without a browser DOM', () => {
  const urls = new Set<string>();
  for (const code of new Set(players.map(player => player.flag))) {
    const url = flagImageUrl(code);
    assert.match(url, /^data:image\/svg\+xml/);
    assert.notEqual(url, flagImageUrl('unknown'), `Missing country flag: ${code}`);
    assert.equal(url, flagImageUrl(code.toLowerCase()), code);
    assert.ok(renderToStaticMarkup(<Flag code={code} large/>).includes(url.replaceAll('&', '&amp;')), code);
    urls.add(url);
  }
  assert.equal(urls.size, new Set(players.map(player => player.flag)).size);
});

test('Football country codes keep England, Northern Ireland, Scotland and Wales distinct', () => {
  const urls = ['EN', 'NI', 'SC', 'WL', 'GB'].map(flagImageUrl);
  assert.equal(new Set(urls).size, 5);
  assert.equal(flagImageUrl(' en '), urls[0]);
  assert.ok(!renderToStaticMarkup(<Flag code="unknown"/>).includes('undefined'));
});
