import { describe, expect, it } from 'vitest';
import { decodeUtf8, encodeUtf8 } from '../../events/utf8';
import { isCompleteJsonObject, repairedJsonPrefix } from './json-prefix';

const repair = (text: string): string | null => {
  const out = repairedJsonPrefix(encodeUtf8(text));
  return out === null ? null : decodeUtf8(out);
};

describe('json prefix', () => {
  it('recognizes one complete object', () => {
    expect(isCompleteJsonObject(encodeUtf8(' {"a":[1,{"b":null}]} '))).toBe(true);
    expect(isCompleteJsonObject(encodeUtf8('{"a":1'))).toBe(false);
    expect(isCompleteJsonObject(encodeUtf8('{"a":1}{'))).toBe(false);
    expect(isCompleteJsonObject(encodeUtf8('[1]'))).toBe(false);
  });

  it('cuts back to the last complete value and closes the containers', () => {
    expect(repair('{"a":1,"b":"x","c":"long unfinis')).toBe('{"a":1,"b":"x"}');
    expect(repair('{"a":{"b":[1,2')).toBe('{"a":{"b":[1]}}');
    expect(repair('{"a":{"b":"y"},"c":')).toBe('{"a":{"b":"y"}}');
    expect(repair('{"a":"q\\"uote","b":tru')).toBe('{"a":"q\\"uote"}');
  });

  it('keeps a complete line as it is and refuses what is not an object prefix', () => {
    expect(repair('{"a":1}')).toBe('{"a":1}');
    expect(repair('not json')).toBeNull();
    expect(repair('{"a":')).toBe('{}');
    expect(repair('{"a" 1}')).toBeNull();
    expect(repair('{"a":1}x')).toBeNull();
    expect(repair('')).toBeNull();
  });
});
