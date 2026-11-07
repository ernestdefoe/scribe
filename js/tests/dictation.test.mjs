/**
 * Voice typing: how a recognized phrase joins the text already there.
 *
 *     npm test
 */

import assert from 'node:assert/strict';
import { check, done } from './_harness.mjs';
import { joinDictation, speechLang } from '../../.test-build/dictation.js';

check('the first phrase in a paragraph gets a capital and no leading space', () => {
  assert.equal(joinDictation('', 'kickoff is at noon'), 'Kickoff is at noon');
});

check('a phrase after a word gets a space, and keeps its case mid-sentence', () => {
  assert.equal(joinDictation('Kickoff is', 'at noon'), ' at noon');
});

check('no doubled space after one already typed', () => {
  assert.equal(joinDictation('Kickoff is ', 'at noon'), 'at noon');
});

check('a new sentence gets a capital', () => {
  assert.equal(joinDictation('We won.', 'next week is away'), ' Next week is away');
  assert.equal(joinDictation('Really?) ', 'yes'), 'Yes');
});

check('punctuation joins without a space', () => {
  assert.equal(joinDictation('We won', ', barely'), ', barely');
});

check('whitespace inside the phrase is tidied, an empty phrase inserts nothing', () => {
  assert.equal(joinDictation('a', '  two   words '), ' two words');
  assert.equal(joinDictation('a', '   '), '');
});

check('the forum locale, as the regional variant the browser prefers', () => {
  assert.equal(speechLang('en', ['en-GB', 'fr-FR']), 'en-GB');
  assert.equal(speechLang('fr', ['en-US', 'fr-CA']), 'fr-CA');
  assert.equal(speechLang('de', ['en-US']), 'de');
  assert.equal(speechLang('', []), 'en');
});

done();
