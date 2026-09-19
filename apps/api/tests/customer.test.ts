import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { normalizePhone } from '../src/services/customer.ts';

test('customer: telefon raqami oxirgi 9 raqamga keltiriladi', () => {
  assert.equal(normalizePhone('90 123 45 67'), '901234567');
  assert.equal(normalizePhone('+998 90 123-45-67'), '901234567');
  assert.equal(normalizePhone('998939876543'), '939876543');
});
