import * as crypto from 'node:crypto';

import * as php from '@trim21/php-serialize';
import _parseDuration from 'parse-duration';

import { BadRequestError } from '@app/lib/error.ts';

const base62Chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
if (base62Chars.length !== 62) {
  throw new TypeError('characters is not 62 length');
}

export function customAlphabet(
  alphabet: string,
  defaultSize = 21,
): (size: number) => Promise<string> {
  const mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
  const step = Math.ceil((1.6 * mask * defaultSize) / alphabet.length);
  const tick: (init: string, size: number) => Promise<string> = (
    prefix: string,
    size: number = defaultSize,
  ) =>
    randomBytes(step).then((bytes: Buffer) => {
      let i = step;
      while (i--) {
        // @ts-expect-error ignore string overload
        prefix += alphabet[bytes[i] & mask] || '';
        if (prefix.length === size) {
          return prefix;
        }
      }
      return tick(prefix, size);
    });
  return (size) => tick('', size);
}

const generator = customAlphabet(base62Chars, 32);

export const randomBase62String = (size: number) => generator(size);
export const randomBase64url = (byteSize: number) =>
  randomBytes(byteSize).then((s) => s.toString('base64url'));

export async function randomBytes(size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(size, (err, buf) => {
      if (err) {
        reject(err);
      } else {
        resolve(buf);
      }
    });
  });
}

/**
 * Parse string as int, strictly
 *
 * 避免出现 `parseInt('1abc') === 1` 的问题
 */
export function intval(value: string | number): number {
  const v = parseIntStrict(value);
  if (v === undefined) {
    throw new Error(`"${value}" is not a valid integer`);
  }
  return v;
}

function parseIntStrict(integer: string | number) {
  if (typeof integer === 'number') {
    return Number.isInteger(integer) ? integer : undefined;
  }

  const n = Number(integer);

  if (Number.isInteger(n)) {
    return n;
  }
}

export function md5(s: string) {
  return crypto.createHash('md5').update(s).digest('hex');
}

export function parseDuration(durationString: string): number {
  if (durationString.includes(':')) {
    const split = durationString.split(':');
    if (split.length > 3) {
      return Number.NaN;
    }

    let result = 0;

    for (const component of split) {
      result = result * 60 + intval(component);
    }

    return result;
  }

  return _parseDuration(durationString, 's') ?? Number.NaN;
}

export function validateDuration(duration: string | undefined) {
  if (!duration) {
    return;
  }
  const durationN = parseDuration(duration);
  if (Number.isNaN(durationN)) {
    throw new BadRequestError(
      `${duration} is not valid duration, use string like 'hh:mm:dd' or '1h10m20s'`,
    );
  }
}

function pad(s: number, n = 2): string {
  return s.toString().padStart(n, '0');
}

export function formatDuration(durationSeconds: number): string {
  if (durationSeconds >= 3600 * 24) {
    return formatLongDuration(durationSeconds);
  }

  const s: string[] = [];
  const hours = Math.floor((durationSeconds %= 86400) / 3600);
  if (hours) {
    s.push(hours.toString());
  }

  const minutes = Math.floor((durationSeconds %= 3600) / 60);
  if (minutes) {
    s.push(pad(minutes));
  } else {
    s.push('00');
  }

  s.push(pad(Math.floor(durationSeconds % 60)));

  return s.join(':');
}

// format duration longer than 1day to string
function formatLongDuration(durationSeconds: number) {
  const s: string[] = [];

  const years = Math.floor(durationSeconds / 31536000);
  if (years) {
    s.push(`${years}y`);
  }

  const days = Math.floor((durationSeconds %= 31536000) / 86400);
  if (days) {
    s.push(`${days}d`);
  }

  const hours = Math.floor((durationSeconds %= 86400) / 3600);
  if (hours) {
    s.push(`${hours}h`);
  }

  const minutes = Math.floor((durationSeconds %= 3600) / 60);
  if (minutes) {
    s.push(`${minutes}m`);
  }

  const seconds = Math.floor(durationSeconds % 60);
  if (seconds) {
    s.push(`${seconds}s`);
  }

  return s.join('');
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function decode(s: string | Buffer): unknown {
  if (s.length === 0) {
    return {};
  }

  let buf: Buffer;
  if (typeof s === 'string') {
    buf = Buffer.from(s, 'utf8');
  } else {
    buf = s;
  }

  if (buf.subarray(0, 2).toString() === 'a:') {
    return php.parse(s);
  }

  return JSON.parse(buf.toString('utf8'));
}
