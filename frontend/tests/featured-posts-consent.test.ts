import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { FeaturedOnLandingField } from '../src/components/FeaturedOnLandingField.js';

void describe('Featured Posts frontend consent', () => {
  void it('renders an accessible unchecked create default and exact disclosure', () => {
    const html = renderToStaticMarkup(
      createElement(FeaturedOnLandingField, {
        onChange: () => undefined,
        value: false,
      }),
    );
    assert.match(html, /type="checkbox"/);
    assert.doesNotMatch(html, /checked=""/);
    assert.match(html, /aria-describedby=/);
    assert.match(html, /Allow this post to be featured on the public homepage/);
    assert.match(
      html,
      /private contact information, profile details, and messages won&#x27;t be included/,
    );
    assert.match(html, /optional and not guaranteed/);
  });

  void it('renders checked, disabled, Lost & Found privacy, and ineligible states', () => {
    const html = renderToStaticMarkup(
      createElement(FeaturedOnLandingField, {
        disabled: true,
        eligible: false,
        lostFound: true,
        onChange: () => undefined,
        value: true,
      }),
    );
    assert.match(html, /checked=""/);
    assert.match(html, /disabled=""/);
    assert.match(html, /Exact locations, claim evidence, and ownership-verification details/);
    assert.match(html, /not currently eligible/);
  });

  void it('wires all four forms and guards edit consent initialization', () => {
    const files = [
      '../src/features/marketplace/ListingForm.tsx',
      '../src/features/marketplace/EditListingPage.tsx',
      '../src/features/lost-found/LostFoundPages.tsx',
      '../src/features/teamup/TeamUpProjectForm.tsx',
      '../src/features/services/ServiceOfferForm.tsx',
      '../src/features/services/services-management-state.ts',
    ];
    const source = files
      .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
      .join('\n');
    assert.equal((source.match(/featuredOnLanding: false/g) ?? []).length, 4);
    assert.ok((source.match(/typeof [^\n]+featuredOnLanding/g) ?? []).length >= 4);
    assert.ok((source.match(/featuredOnLanding: [a-z]+\.featuredOnLanding/g) ?? []).length >= 4);
    assert.match(source, /disabled=\{isSaving\}/);
    assert.match(source, /disabled=\{saving\}/);
    assert.match(source, /catch/);
  });
});
