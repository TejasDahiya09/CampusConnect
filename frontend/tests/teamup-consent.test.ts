import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeaturedOnLandingField } from '../src/components/FeaturedOnLandingField';
import { TeamUpFeaturedConsent } from '../src/features/teamup/TeamUpFeaturedConsent';
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
void describe('TeamUp consent disclosure presentation', () => {
  void it('retains the complete shared privacy disclosure behind one native disclosure and one checkbox', () => {
    const common = { value: false, onChange: () => undefined };
    const original = text(renderToStaticMarkup(createElement(FeaturedOnLandingField, common)));
    const html = renderToStaticMarkup(createElement(TeamUpFeaturedConsent, common));
    assert.ok(text(html).includes(original.slice(original.indexOf('Your post may appear'))));
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 1);
    assert.match(html, /<summary>Learn more<\/summary>/);
    assert.doesNotMatch(html, /checked=""|<details open/);
    assert.match(html, /aria-describedby=/);
  });
  void it('preserves stored checked state, pending disablement and visible ineligible feedback', () => {
    const html = renderToStaticMarkup(
      createElement(TeamUpFeaturedConsent, {
        value: true,
        disabled: true,
        eligible: false,
        onChange: () => undefined,
      }),
    );
    assert.match(html, /checked=""/);
    assert.match(html, /disabled=""/);
    assert.match(html, /This post is not currently eligible because of its lifecycle status/);
    assert.match(html, /disabling it prevents future inclusion in uncached homepage responses/);
  });
});
