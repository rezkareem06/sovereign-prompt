/**
 * Luhn Algorithm (Modulus 10) validator.
 * Used to validate Saudi National IDs (10-digit numbers starting with 1 or 2).
 *
 * @param {string|number} num - The number to validate.
 * @returns {boolean} - True if the number passes the Luhn check.
 */
function luhnCheck(num) {
  const digits = String(num).split('').map(Number);
  let sum = 0;
  let isEven = false;

  // Traverse from right to left
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits[i];

    if (isEven) {
      d *= 2;
      if (d > 9) d -= 9;
    }

    sum += d;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

module.exports = { luhnCheck };
