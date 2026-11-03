import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it } from 'node:test';
import { ContentVisual } from '../src/features/landing/ContentVisual';
import { HighlightCard } from '../src/features/landing/HighlightCard';
import { LandingHero } from '../src/features/landing/LandingHero';
import { LandingModuleScene, PlatformShowcase } from '../src/features/landing/PlatformShowcase';
import { parseLandingHighlightsResponse } from '../src/features/landing/landing-highlights';
import {
  contentVisual,
  highlightPresentation,
  spotlightSelection,
} from '../src/features/landing/landing-presentation';
import { platformModules } from '../src/features/landing/landing-content';

const common = { createdAt: '2026-10-25T00:00:00.000Z', summary: 'Sanitized public summary.' };
const records = parseLandingHighlightsResponse({
  success: true,
  data: {
    highlights: [
      {
        ...common,
        kind: 'SERVICE',
        id: '11111111-1111-4111-8111-111111111111',
        route: '/services/11111111-1111-4111-8111-111111111111',
        title: 'Presentation design',
        metadata: {
          category: 'Design',
          currency: 'INR',
          price: null,
          pricingType: 'NEGOTIABLE',
          skills: [],
        },
      },
      {
        ...common,
        kind: 'MARKETPLACE',
        id: '22222222-2222-4222-8222-222222222222',
        route: '/marketplace/22222222-2222-4222-8222-222222222222',
        title: 'Used textbook',
        metadata: {
          category: 'Books & Study Material',
          condition: 'GOOD',
          currency: 'INR',
          price: '500.00',
        },
        privateContact: 'private-must-not-render',
      },
      {
        ...common,
        kind: 'LOST_FOUND',
        id: '33333333-3333-4333-8333-333333333333',
        route: '/lost-found/33333333-3333-4333-8333-333333333333',
        title: 'Grey backpack',
        metadata: { category: null, reportType: 'FOUND', status: 'OPEN' },
      },
      {
        ...common,
        kind: 'TEAMUP',
        id: '44444444-4444-4444-8444-444444444444',
        route: '/teamup/44444444-4444-4444-8444-444444444444',
        title: 'Campus project',
        metadata: { category: null, requiredSkills: ['React'], status: 'OPEN' },
      },
    ],
  },
});

const render = (element: React.ReactNode) =>
  renderToStaticMarkup(createElement(MemoryRouter, { children: element }));

void describe('landing presentation and rendered contracts', () => {
  void it('preserves backend order, deduplicates, bounds selection and handles an empty feed', () => {
    assert.deepEqual(spotlightSelection(records), records);
    assert.deepEqual(spotlightSelection([...records, ...records]), records);
    assert.deepEqual(spotlightSelection([]), []);
    assert.equal(
      spotlightSelection(
        Array.from({ length: 20 }, (_, index) => ({ ...records[0], id: String(index) })),
      ).length,
      8,
    );
    assert.equal(highlightPresentation(records[0]).price, 'Negotiable');
    assert.equal(highlightPresentation(records[1]).visual, 'book');
    assert.equal(highlightPresentation(records[2]).category, 'Lost & Found');
  });
  void it('chooses recognizable neutral artwork without treating all Marketplace posts as calculators', () => {
    for (const [title, category, expected] of [
      ['Scientific calculator', 'Calculators', 'calculator'],
      ['College bag', 'Clothing & Accessories', 'bag'],
      ['Study textbook', 'Books', 'book'],
      ['Laptop', 'Electronics', 'device'],
      ['Bicycle', 'Cycles', 'cycle'],
      ['Study desk', 'Furniture', 'furniture'],
      ['Key ring', 'Other', 'keys'],
      ['Wallet', 'Other', 'wallet'],
      ['ID card', 'Other', 'identity'],
      ['Miscellaneous item', 'Other', 'item'],
    ] as const)
      assert.equal(contentVisual('MARKETPLACE', title, category), expected);
    assert.equal(contentVisual('SERVICE', 'Exam preparation', 'Tutoring'), 'tutoring');
    assert.equal(contentVisual('SERVICE', 'Presentation', 'Design'), 'design');
    assert.equal(contentVisual('TEAMUP', 'Build a project', 'Technology'), 'project');
    assert.match(
      render(createElement(ContentVisual, { kind: 'calculator' })),
      /Category illustration/,
    );
  });
  void it('renders every live module using only safe fields and exact internal routes', () => {
    for (const item of records) {
      const html = render(createElement(HighlightCard, { item }));
      assert.ok(html.includes(item.title));
      assert.ok(html.includes(`href="${item.route}"`));
      assert.match(html, /Owner-featured/);
      assert.match(html, /Category illustration/);
      assert.doesNotMatch(html, /private-must-not-render|<img|storageKey/);
    }
  });
  void it('escapes titles and summaries rather than executing markup', () => {
    const item = {
      ...records[1],
      title: '<script>alert(1)</script>',
      summary: '<img onerror="bad()">',
    };
    const html = render(createElement(HighlightCard, { item }));
    assert.doesNotMatch(html, /<script|<img/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;img/);
  });
  void it('renders all five reachable selector buttons with a single selected module', () => {
    const html = render(createElement(PlatformShowcase, { highlights: records, loading: false }));
    assert.equal((html.match(/aria-controls="landing-module-scene"/g) ?? []).length, 5);
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
    assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 4);
    for (const module of platformModules)
      assert.ok(html.includes(module.title.replaceAll('&', '&amp;')));
  });
  void it('renders real scenes, labeled fallbacks, loading states and a permanently illustrative assistant', () => {
    for (const module of platformModules) {
      const real = render(
        createElement(LandingModuleScene, {
          moduleId: module.id,
          highlights: records,
          loading: false,
        }),
      );
      const fallback = render(
        createElement(LandingModuleScene, { moduleId: module.id, highlights: [], loading: false }),
      );
      assert.match(fallback, /Illustrative/);
      if (module.id === 'assistant') assert.match(real, /Illustrative assistant preview/);
      else {
        assert.match(real, /Owner-featured/);
        assert.match(
          render(
            createElement(LandingModuleScene, {
              moduleId: module.id,
              highlights: [],
              loading: true,
            }),
          ),
          /Loading featured campus posts/,
        );
      }
      if (module.id === 'lost-found')
        assert.match(real, /Shown independently, not as verified matches/);
      assert.doesNotMatch(fallback, /<button/);
    }
  });
  void it('keeps the hero headline, CTA destinations, fallback artwork and manual spotlight pause', () => {
    const empty = render(createElement(LandingHero, { highlights: [], loading: false }));
    assert.equal((empty.match(/<h1>/g) ?? []).length, 1);
    assert.match(empty, /href="\/register"/);
    assert.match(empty, /href="#product"/);
    assert.match(empty, /ILLUSTRATIVE PREVIEW/);
    assert.match(empty, /data-visual="calculator"/);
    const live = render(createElement(LandingHero, { highlights: records, loading: false }));
    assert.match(live, /FEATURED BY ITS OWNER · Services/);
    assert.match(live, /Pause spotlight/);
    assert.match(live, /aria-pressed="false"/);
    assert.match(live, /data-visual="design"/);
    assert.doesNotMatch(live, /aria-live=/);
  });
});
