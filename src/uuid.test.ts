import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUUID } from './uuid';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('createUUID', () => {
  it('uses randomUUID on secure origins', () => {
    const randomUUID = vi.fn(() => 'e8d8cd61-4ba7-4c97-8ad1-3df580e23ed2');
    vi.stubGlobal('crypto', { randomUUID });
    expect(createUUID()).toBe('e8d8cd61-4ba7-4c97-8ad1-3df580e23ed2');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates a valid v4 UUID when randomUUID is unavailable over LAN HTTP', () => {
    let counter = 0;
    const getRandomValues = vi.fn((bytes:Uint8Array) => {
      for (let i=0;i<bytes.length;i++) bytes[i] = counter++;
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const first = createUUID();
    const second = createUUID();
    expect(first).toMatch(uuidV4);
    expect(second).toMatch(uuidV4);
    expect(first).not.toBe(second);
    expect(getRandomValues).toHaveBeenCalledTimes(2);
  });

  it('avoids crashing legacy demo browsers without crypto', () => {
    vi.stubGlobal('crypto', undefined);
    expect(createUUID()).toMatch(uuidV4);
  });
});
