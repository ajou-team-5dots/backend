import { deepFreeze } from './deep-freeze.js';

describe('deepFreeze', () => {
  it('안쪽 객체와 배열까지 얼린다', () => {
    const value = deepFreeze({ rows: [{ id: 'a' }], meta: { n: 1 } });

    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.rows)).toBe(true);
    expect(Object.isFrozen(value.rows[0])).toBe(true);
    expect(Object.isFrozen(value.meta)).toBe(true);
  });

  it('이미 얼린 객체 안의 얼지 않은 값도 얼린다', () => {
    const inner = { id: 'a' };
    const outer = Object.freeze({ inner });

    deepFreeze(outer);

    expect(Object.isFrozen(inner)).toBe(true);
  });

  it('순환 참조에서 멈춘다', () => {
    interface Node {
      next?: Node;
    }
    const node: Node = {};
    node.next = node;

    expect(() => deepFreeze(node)).not.toThrow();
    expect(Object.isFrozen(node)).toBe(true);
  });

  it('원시값과 typed array는 그대로 둔다', () => {
    const bytes = new Uint8Array([1, 2]);

    expect(deepFreeze(3)).toBe(3);
    expect(deepFreeze(null)).toBeNull();
    expect(Object.isFrozen(deepFreeze({ bytes }).bytes)).toBe(false);
  });
});
