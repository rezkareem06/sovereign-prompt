const { luhnCheck } = require('../utils/luhn');

describe('Luhn Algorithm', () => {

  describe('valid numbers (should return true)', () => {
    test('valid citizen ID 1000000388', () => expect(luhnCheck('1000000388')).toBe(true));
    test('valid resident ID 2000000097', () => expect(luhnCheck('2000000097')).toBe(true));
    test('valid citizen ID 1000000776', () => expect(luhnCheck('1000000776')).toBe(true));
    test('classic Luhn test number 79927398713', () => expect(luhnCheck('79927398713')).toBe(true));
  });

  describe('invalid numbers (should return false)', () => {
    test('made-up number 1045238912', () => expect(luhnCheck('1045238912')).toBe(false));
    test('made-up resident 2176543890', () => expect(luhnCheck('2176543890')).toBe(false));
    test('off-by-one 1000000389', () => expect(luhnCheck('1000000389')).toBe(false));
    test('all zeros 0000000000', () => expect(luhnCheck('0000000000')).toBe(true)); // edge: technically valid
    test('single digit 0', () => expect(luhnCheck('0')).toBe(true));
  });

});
