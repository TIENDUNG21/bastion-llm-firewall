import { describe, expect, it } from 'vitest';
import { shannonEntropy } from '../../src/output/entropy.js';
import { findSecrets } from '../../src/output/secrets.js';

// Fake credentials are assembled at runtime so that repository secret
// scanners do not mistake the test file for a leak.
const join = (...parts: string[]) => parts.join('');
const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const FAKE = {
  aws: join('AKIA', 'IOSFODNN7', 'EXAMPLE'),
  github: join('gh', 'p_', 'aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3z5A'),
  slack: join('xo', 'xb-', '1234567890-0987654321-AbCdEfGhIjKlMnOp'),
  stripe: join('sk', '_live_', '4eC39HqLyjWDarjtT1zdp7dc'),
  google: join('AI', 'za', 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q'),
  apiKey: join('sk', '-proj-', 'Q9vX2mL7pT4rW8yZ1aB5cD3eF6gH0jK2'),
  jwt: join(
    b64url('{"alg":"HS256","typ":"JWT"}'),
    '.',
    b64url('{"sub":"42","name":"Test"}'),
    '.',
    'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  ),
};

const found = (text: string) => findSecrets(text).map((s) => s.kind);

describe('shannonEntropy', () => {
  it('is 0 for a repeated character and log2(n) for n distinct characters', () => {
    expect(shannonEntropy('')).toBe(0);
    expect(shannonEntropy('aaaa')).toBe(0);
    expect(shannonEntropy('abcd')).toBe(2);
    expect(shannonEntropy('ab')).toBe(1);
  });
});

describe('findSecrets', () => {
  it.each([
    ['aws-access-key', `key=${FAKE.aws}`],
    ['github-token', `token ${FAKE.github}`],
    ['slack-token', `slack: ${FAKE.slack}`],
    ['stripe-key', `stripe ${FAKE.stripe}`],
    ['google-api-key', `maps ${FAKE.google}`],
    ['api-key', `use ${FAKE.apiKey} here`],
    ['jwt', `Authorization: Bearer ${FAKE.jwt}`],
  ])('finds %s', (kind, text) => {
    expect(found(text)).toContain(kind);
  });

  it('finds PEM private key blocks, and a header alone when the block is cut off', () => {
    const begin = join('-----BEGIN RSA ', 'PRIVATE KEY-----');
    const end = join('-----END RSA ', 'PRIVATE KEY-----');
    const full = findSecrets(`${begin}\nMIIEowIBAAKCAQEA7\n${end}`);
    expect(full).toHaveLength(1);
    expect(full[0]).toMatchObject({ kind: 'private-key', confidence: 'high' });
    expect(findSecrets(`${begin}\nMIIEow`)[0]).toMatchObject({
      kind: 'private-key',
      confidence: 'medium',
    });
  });

  it('finds credentials embedded in URLs', () => {
    expect(found('postgres://admin:S3cr3tPass@db.example.com:5432/app')).toEqual([
      'url-credentials',
    ]);
  });

  it('finds secret-looking values assigned to secret-looking names', () => {
    const spans = findSecrets('DB_PASSWORD = "x7#Kp9!qL2mZ"');
    expect(spans[0]).toMatchObject({ kind: 'assigned-secret', value: 'x7#Kp9!qL2mZ' });
  });

  it('ignores placeholders and low-entropy values', () => {
    expect(found('password = changeme')).toEqual([]);
    expect(found('api_key: "<your-api-key>"')).toEqual([]);
    expect(found('token=xxxxxxxxxxxx')).toEqual([]);
  });

  it('flags long high-entropy tokens with low confidence but not hex hashes', () => {
    const token = 'Zx8Qp2Lm7Vb4Nc1Kd9Fg3Hj6Ty5Re0WsAq8Pl2Mn';
    expect(findSecrets(`blob ${token}`)[0]).toMatchObject({
      kind: 'high-entropy',
      confidence: 'low',
    });
    expect(found('commit 2fd4e1c67a2d28fced849ee1bb76e7391b93eb12')).toEqual([]);
    expect(found('id 123e4567-e89b-12d3-a456-426614174000')).toEqual([]);
  });

  it('ignores a JWT-shaped string whose header is not JSON', () => {
    expect(found(join('eyJ', 'hbGxv', '.eyJ', 'zdWIi', '.abcdefghij'))).not.toContain('jwt');
  });

  it('reports one span per secret even when several rules overlap', () => {
    const spans = findSecrets(`export STRIPE_SECRET_KEY=${FAKE.stripe}`);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.kind).toBe('stripe-key');
  });

  it('returns nothing for ordinary prose', () => {
    expect(findSecrets('The quick brown fox jumps over the lazy dog.')).toEqual([]);
  });
});
