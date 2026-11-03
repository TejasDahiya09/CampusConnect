import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSpotlightController } from '../src/features/landing/landing-spotlight';

class Visibility extends EventTarget {
  hidden = false;
}
class Motion extends EventTarget {
  matches = false;
}

function clock(count = 3, reduced = false) {
  const visibility = new Visibility();
  const motion = new Motion();
  motion.matches = reduced;
  const callbacks = new Map<number, () => void>();
  let nextId = 0;
  let advances = 0;
  const controller = createSpotlightController(
    count,
    () => {
      advances += 1;
    },
    {
      visibility,
      motion,
      schedule: (callback, delay) => {
        assert.equal(delay, 10000);
        const id = ++nextId;
        callbacks.set(id, callback);
        return () => {
          callbacks.delete(id);
        };
      },
    },
  );
  return {
    controller,
    visibility,
    motion,
    callbacks,
    get advances() {
      return advances;
    },
    tick() {
      const next = callbacks.entries().next().value;
      if (!next) return;
      callbacks.delete(next[0]);
      next[1]();
    },
  };
}

void describe('landing spotlight lifecycle', () => {
  void it('keeps zero or one featured record stable', () => {
    for (const count of [0, 1]) {
      const test = clock(count);
      assert.equal(test.callbacks.size, 0);
      test.tick();
      assert.equal(test.advances, 0);
      test.controller.dispose();
    }
  });
  void it('advances slowly with exactly one timer and no record fetching', () => {
    const test = clock();
    assert.equal(test.callbacks.size, 1);
    test.tick();
    assert.equal(test.advances, 1);
    assert.equal(test.callbacks.size, 1);
    test.tick();
    assert.equal(test.advances, 2);
    test.controller.dispose();
  });
  void it('does not resume on pointer exit while keyboard focus remains inside', () => {
    const test = clock();
    test.controller.pause('focus', true);
    test.controller.pause('hover', true);
    test.controller.pause('hover', false);
    assert.equal(test.callbacks.size, 0);
    test.tick();
    assert.equal(test.advances, 0);
    test.controller.pause('focus', false);
    assert.equal(test.callbacks.size, 1);
    test.controller.dispose();
  });
  void it('pauses on hidden tabs and starts a full interval when visible again', () => {
    const test = clock();
    test.visibility.hidden = true;
    test.visibility.dispatchEvent(new Event('visibilitychange'));
    assert.equal(test.callbacks.size, 0);
    test.tick();
    assert.equal(test.advances, 0);
    test.visibility.hidden = false;
    test.visibility.dispatchEvent(new Event('visibilitychange'));
    assert.equal(test.callbacks.size, 1);
    test.controller.dispose();
  });
  void it('honors initial and changing reduced-motion preferences', () => {
    const test = clock(3, true);
    assert.equal(test.callbacks.size, 0);
    test.motion.matches = false;
    test.motion.dispatchEvent(new Event('change'));
    assert.equal(test.callbacks.size, 1);
    test.motion.matches = true;
    test.motion.dispatchEvent(new Event('change'));
    assert.equal(test.callbacks.size, 0);
    test.controller.dispose();
  });
  void it('keeps manual pause across focus, hover and visibility changes', () => {
    const test = clock();
    test.controller.pause('manual', true);
    test.controller.pause('focus', true);
    test.controller.pause('focus', false);
    test.visibility.dispatchEvent(new Event('visibilitychange'));
    assert.equal(test.callbacks.size, 0);
    test.controller.pause('manual', false);
    assert.equal(test.callbacks.size, 1);
    test.controller.dispose();
  });
  void it('cancels timers and removes listeners on unmount', () => {
    const test = clock();
    const lateCallback = test.callbacks.values().next().value;
    test.controller.dispose();
    assert.equal(test.callbacks.size, 0);
    test.visibility.dispatchEvent(new Event('visibilitychange'));
    test.motion.dispatchEvent(new Event('change'));
    lateCallback?.();
    assert.equal(test.callbacks.size, 0);
    assert.equal(test.advances, 0);
  });
});
