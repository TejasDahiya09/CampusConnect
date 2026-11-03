/** Replay real local AI outputs for synthetic reports through the existing Possible Matches UI. */
import assert from 'node:assert/strict';
import { openChromeFixture } from './chrome-fixture-driver.mjs';

const browser = await openChromeFixture(process.argv[2]);
const { send, evaluate, waitFor, screenshot } = browser;
const click = async (label) => {
  await evaluate(
    `(() => {const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)});if(!button)throw new Error('Missing matching action');button.click();})()`,
  );
};
try {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', {
    url: browser.origin + '/light.html?page=detail&case=owner-live-ai',
  });
  await waitFor(
    "document.body.innerText.includes('Synthetic lost black scientific calculator')&&!![...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Find possible matches')",
  );
  assert.equal(
    await evaluate("window.__qaCalls.filter(call=>call.path.endsWith('/matches')).length"),
    0,
  );
  await evaluate('window.__qaFailMatching=true');
  await click('Find possible matches');
  await waitFor("document.body.innerText.includes('AI matching is temporarily unavailable')");
  await evaluate('window.__qaFailMatching=false');
  await click('Try again');
  await waitFor("document.body.innerText.includes('Synthetic found black scientific calculator')");
  assert.equal(
    await evaluate("document.body.innerText.toLowerCase().includes('why this matched')"),
    true,
  );
  await evaluate(
    "[...document.querySelectorAll('h2')].find(element=>element.textContent==='Possible matches').scrollIntoView({block:'start',behavior:'instant'})",
  );
  await screenshot('possible-matches-real-ai-output');
  await evaluate('window.__qaEmptyMatches=true');
  await click('Refresh matches');
  await waitFor("document.body.innerText.includes('No strong matches found yet')");
  assert.equal(
    await evaluate(
      "document.body.innerText.includes('Synthetic found black scientific calculator')",
    ),
    false,
  );
  await screenshot('possible-matches-empty-real-ai-output');
  assert.equal(
    await evaluate('window.__qaNetwork'),
    0,
    'No external requests or production writes',
  );
  assert.deepEqual(browser.errors, []);
  console.log(
    'Possible Matches Chrome: real AI output replay, error/retry, populated results and empty state PASS. Synthetic records only.',
  );
} finally {
  await browser.close();
}
