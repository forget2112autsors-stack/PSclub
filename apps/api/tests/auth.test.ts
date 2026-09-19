import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { hashPin, verifyPin } from '../src/auth.ts';
import { BusinessError, fail } from '../src/errors.ts';

test('auth: PIN-kod to\'g\'ri xeshlanadi va tekshiriladi', async () => {
  const pin = '1234';
  const hash = await hashPin(pin);
  assert.notEqual(hash, pin);
  assert.equal(await verifyPin(pin, hash), true);
  assert.equal(await verifyPin('0000', hash), false);
});

test('errors: fail funksiyasi BusinessError xatosini otadi', () => {
  assert.throws(
    () => fail('Hisobda xatolik'),
    (err: unknown) => err instanceof BusinessError && err.message === 'Hisobda xatolik',
  );
});
