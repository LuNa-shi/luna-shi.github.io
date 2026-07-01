import { describe, expect, it } from 'vitest';

import { toExactArrayBuffer } from './array-buffer';

describe('toExactArrayBuffer', () => {
  it('returns only the visible bytes from a sliced Node Buffer', () => {
    const source = Buffer.from('use strict;wOFFfont-data');
    const fontBytes = source.subarray('use strict;'.length);

    const exact = new Uint8Array(toExactArrayBuffer(fontBytes));

    expect(new TextDecoder().decode(exact)).toBe('wOFFfont-data');
  });
});
