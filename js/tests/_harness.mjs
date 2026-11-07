// Shared by the tests below: a tiny check() that counts instead of stopping.
let failures = 0;
let passes = 0;

export function check(name, fn) {
  try {
    fn();
    passes++;
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${e.message}`);
  }
}

export function done() {
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
