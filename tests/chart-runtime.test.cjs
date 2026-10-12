const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRingRuntime } = require('../.test-build/components/charting/ringRuntime.js');
const segments = [{ key: 'food', label: 'Food', value: 100, color: '#28B69C' }];
function harness(failFrame = false) {
  const originalRequest = globalThis.requestAnimationFrame,
    originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map();
  let id = 0,
    draws = 0,
    disposed = false,
    scene;
  const Renderer = class {
    debug = {};
    setPixelRatio() {}
    setSize() {}
    render(value) {
      draws++;
      scene = value;
    }
    dispose() {
      disposed = true;
    }
  };
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (frame) => frames.delete(frame);
  const gl = {
    drawingBufferWidth: 320,
    drawingBufferHeight: 230,
    endFrameEXP: () => {
      if (failFrame) throw new Error('Context unavailable');
    },
  };
  return {
    gl,
    rendererFactory: () => new Renderer(),
    frames,
    get draws() {
      return draws;
    },
    get disposed() {
      return disposed;
    },
    get scene() {
      return scene;
    },
    tick(time) {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
    },
    restore() {
      if (originalRequest) globalThis.requestAnimationFrame = originalRequest;
      else delete globalThis.requestAnimationFrame;
      if (originalCancel) globalThis.cancelAnimationFrame = originalCancel;
      else delete globalThis.cancelAnimationFrame;
    },
  };
}
test('3D updates reuse geometry for selection, stop finite animations, coalesce drag frames and cancel on disposal', () => {
  const h = harness();
  let runtime;
  try {
    runtime = createRingRuntime(
      h.gl,
      false,
      () => assert.fail('Unexpected renderer failure'),
      h.rendererFactory
    );
    runtime.update(segments, null, '#FFFFFF');
    const group = h.scene.children.find((object) => object.isGroup);
    runtime.update(segments, 'food', '#FFFFFF');
    assert.equal(
      h.scene.children.find((object) => object.isGroup),
      group
    );
    for (let time = 0; time <= 700; time += 34) h.tick(time);
    assert.equal(h.frames.size, 0);
    assert.ok(h.draws < 25);
    const before = h.draws;
    runtime.rotate(0.1);
    runtime.rotate(0.2);
    runtime.rotate(0.3);
    assert.equal(h.frames.size, 1);
    h.tick(800);
    assert.equal(h.draws, before + 1);
    runtime.rotate(0.4);
    runtime.dispose();
    assert.equal(h.frames.size, 0);
    assert.equal(h.disposed, true);
    const finalDraws = h.draws;
    runtime.update(segments, null, '#FFFFFF');
    runtime.rotate(0.5);
    h.tick(900);
    assert.equal(h.draws, finalDraws);
  } finally {
    runtime?.dispose();
    h.restore();
  }
});
test('failed GL presentation disposes resources and schedules no more frames; reduced motion renders without a loop', () => {
  for (const failFrame of [true, false]) {
    const h = harness(failFrame);
    let runtime,
      failures = 0;
    try {
      runtime = createRingRuntime(
        h.gl,
        !failFrame,
        () => {
          failures++;
          runtime.dispose();
        },
        h.rendererFactory
      );
      runtime.update(segments, null, '#FFFFFF');
      assert.equal(h.frames.size, 0);
      assert.equal(failures, failFrame ? 1 : 0);
      assert.equal(h.disposed, failFrame);
    } finally {
      runtime?.dispose();
      h.restore();
    }
  }
});
