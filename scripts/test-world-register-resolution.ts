import assert from "node:assert/strict";

import {
  loadWorldRegister,
  resolveRegisterName,
} from "./world-historical-utils";

const register = loadWorldRegister();

const cases = [
  {
    input: "S Madan Lal",
    expectedId: "a0e8a1f4",
  },
  {
    input: "Madan Lal",
    expectedId: "a0e8a1f4",
  },
  {
    input: "M Amarnath",
    expectedId: "00266ad6",
  },
  {
    input: "S Abid Ali",
    expectedId: "4ffcc6b8",
  },
];

for (const testCase of cases) {
  const person = resolveRegisterName(
    register,
    testCase.input
  );

  assert.equal(
    person.identifier,
    testCase.expectedId,
    `Wrong identity resolved for "${testCase.input}".`
  );

  console.log(
    `[WORLD REGISTER TEST] ${testCase.input} -> ${person.name} (${person.identifier})`
  );
}

// A surname shared by multiple registered players must never resolve
// to an arbitrary player.
assert.throws(
  () => resolveRegisterName(register, "Amarnath"),
  /Ambiguous abbreviated player name/
);

console.log(
  "[WORLD REGISTER TEST] All identity-resolution tests passed."
);