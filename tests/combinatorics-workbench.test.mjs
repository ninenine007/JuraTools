import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../utilities/combinatorics-workbench.html', import.meta.url), 'utf8');
const source = html.match(/<script id="combinatorics-core">([\s\S]*?)<\/script>/)?.[1];
assert.ok(source, 'workbench exposes its pure calculation engine');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const Core = context.window.CombinatoricsCore;

function model(method, overrides = {}) {
  const memberRows = overrides.memberRows ?? [
    { id: 'm1', label: 'Member', quantity: overrides.n ?? 5, identity: 'distinct', tags: [] }
  ];
  return {
    method,
    n: 5,
    r: 3,
    memberRows,
    groups: [
      { id: 'g1', label: 'Group A', min: 0, max: null },
      { id: 'g2', label: 'Group B', min: 0, max: null }
    ],
    groupCount: 2,
    groupMode: 'labeled',
    constraints: [],
    ...overrides
  };
}

test('exact primitives use arbitrary-precision integers', () => {
  assert.equal(Core.factorial(0n), 1n);
  assert.equal(Core.factorial(30n), 265252859812191058636308480000000n);
  assert.equal(Core.choose(52n, 5n), 2598960n);
  assert.equal(Core.permute(10n, 3n), 720n);
});

test('direct methods return exact counts and concise mathematical working', () => {
  const combination = Core.solve(model('combination', { n: 10, r: 3 }));
  assert.equal(combination.status, 'exact');
  assert.equal(combination.count, 120n);
  assert.match(combination.summary, /10 distinct members; choose 3; order ignored; no repetition/i);
  assert.ok(combination.math.some((line) => line.includes('10!')));

  assert.equal(Core.solve(model('permutation', { n: 10, r: 3 })).count, 720n);
  assert.equal(Core.solve(model('combination-repetition', { n: 4, r: 3 })).count, 20n);
  assert.equal(Core.solve(model('permutation-repetition', { n: 4, r: 3 })).count, 64n);
  assert.equal(Core.solve(model('subset', { n: 8 })).count, 256n);
  assert.equal(Core.solve(model('circular', { n: 6 })).count, 120n);
});

test('multiset, multinomial, stars and bars, and bounded allocations are exact', () => {
  const multiset = Core.solve(model('multiset', {
    memberRows: [
      { id: 'a', label: 'A', quantity: 3, identity: 'identical', tags: [] },
      { id: 'b', label: 'B', quantity: 2, identity: 'identical', tags: [] }
    ]
  }));
  assert.equal(multiset.count, 10n);

  assert.equal(Core.solve(model('multinomial', { groupSizes: [2, 2, 1], n: 5 })).count, 30n);
  assert.equal(Core.solve(model('stars-bars', { n: 5, groupCount: 3, minEach: 1, maxEach: null })).count, 6n);
  assert.equal(Core.solve(model('stars-bars', { n: 7, groupCount: 3, minEach: 1, maxEach: 3 })).count, 6n);
});

test('constrained combinations and permutations use canonical enumeration', () => {
  const rows = ['A', 'B', 'C', 'D'].map((label) => ({ id: label, label, quantity: 1, identity: 'distinct', tags: [] }));
  const required = Core.solve(model('combination', {
    n: 4,
    r: 2,
    memberRows: rows,
    constraints: [{ id: 'c1', type: 'required', members: ['A'], active: true }]
  }));
  assert.equal(required.count, 3n);
  assert.equal(required.verification, 'canonical-enumeration');

  const nonAdjacent = Core.solve(model('permutation', {
    n: 4,
    r: 4,
    memberRows: rows,
    constraints: [{ id: 'c2', type: 'separated', members: ['A', 'B'], active: true }]
  }));
  assert.equal(nonAdjacent.count, 12n);
});

test('labeled group allocation respects fixed groups and capacities', () => {
  const rows = ['A', 'B', 'C'].map((label) => ({ id: label, label, quantity: 1, identity: 'distinct', tags: [] }));
  const result = Core.solve(model('distribution', {
    n: 3,
    memberRows: rows,
    groups: [
      { id: 'g1', label: 'Alpha', min: 1, max: 2 },
      { id: 'g2', label: 'Beta', min: 1, max: 2 }
    ],
    constraints: [{ id: 'c1', type: 'fixed-group', members: ['A'], groupId: 'g1', active: true }]
  }));
  assert.equal(result.count, 3n);
});

test('distribution and multinomial allocation apply member constraints', () => {
  const rows = ['A', 'B', 'C'].map((label) => ({ id: label, label, quantity: 1, identity: 'distinct', tags: [] }));
  const distributed = Core.solve(model('distribution', {
    memberRows: rows,
    constraints: [{ id: 'c1', type: 'excluded', members: ['A'], active: true }]
  }));
  assert.equal(distributed.count, 0n, 'an allocated member cannot satisfy an exclusion rule');

  const multinomial = model('multinomial', {
    memberRows: rows,
    groupSizes: [2, 1],
    constraints: [{ id: 'c2', type: 'together', members: ['A', 'B'], active: true }]
  });
  assert.equal(Core.solve(multinomial).count, 1n);
  assert.equal(Array.from(Core.enumerate(multinomial)).length, 1);
});

test('identity mode and unlabeled groups change the mathematical outcome', () => {
  const identicalRows = [
    { id: 'a', label: 'A', quantity: 2, identity: 'identical', tags: [] },
    { id: 'b', label: 'B', quantity: 2, identity: 'identical', tags: [] }
  ];
  assert.equal(Core.solve(model('combination', { r: 2, memberRows: identicalRows })).count, 3n);
  assert.equal(Core.solve(model('permutation', { r: 2, memberRows: identicalRows })).count, 4n);

  const distinctRows = ['A', 'B', 'C'].map((label) => ({ id: label, label, quantity: 1, identity: 'distinct', tags: [] }));
  const unlabeled = Core.solve(model('distribution', {
    memberRows: distinctRows,
    groupMode: 'unlabeled',
    groupCount: 2,
    groups: [
      { id: 'g1', label: 'Group 1', min: 1, max: null },
      { id: 'g2', label: 'Group 2', min: 1, max: null }
    ]
  }));
  assert.equal(unlabeled.count, 3n);
});

test('circular arrangements canonicalize rotations of identical quantities', () => {
  const circularModel = model('circular', {
    memberRows: [
      { id: 'a', label: 'A', quantity: 2, identity: 'identical', tags: [] },
      { id: 'b', label: 'B', quantity: 1, identity: 'identical', tags: [] }
    ]
  });
  assert.equal(Core.solve(circularModel).count, 1n);
  assert.equal(Array.from(Core.enumerate(circularModel)).length, 1);
});

test('addition and multiplication rules generate deterministic symbolic outcomes', () => {
  const addition = model('addition', { factors: ['2', '3'], memberRows: [] });
  assert.equal(Core.solve(addition).count, 5n);
  assert.deepEqual(JSON.parse(JSON.stringify(Array.from(Core.enumerate(addition)))), [
    ['Case 1', 'Outcome 1'], ['Case 1', 'Outcome 2'],
    ['Case 2', 'Outcome 1'], ['Case 2', 'Outcome 2'], ['Case 2', 'Outcome 3']
  ]);

  const multiplication = model('multiplication', { factors: ['2', '2'], memberRows: [] });
  assert.equal(Core.solve(multiplication).count, 4n);
  assert.deepEqual(JSON.parse(JSON.stringify(Array.from(Core.enumerate(multiplication)))), [
    ['Stage 1 choice 1', 'Stage 2 choice 1'],
    ['Stage 1 choice 1', 'Stage 2 choice 2'],
    ['Stage 1 choice 2', 'Stage 2 choice 1'],
    ['Stage 1 choice 2', 'Stage 2 choice 2']
  ]);
});

test('constraint meaning follows the selected combinatorial structure', () => {
  const rows = ['A', 'B', 'C', 'D'].map((label) => ({ id: label, label, quantity: 1, identity: 'distinct', tags: [] }));
  const separatedSelection = Core.solve(model('combination', {
    r: 3,
    memberRows: rows,
    constraints: [{ id: 's', type: 'separated', members: ['A', 'C'], active: true }]
  }));
  assert.equal(separatedSelection.count, 2n, 'separated members cannot both appear in an unordered selection');

  const circularSeparation = Core.solve(model('circular', {
    memberRows: rows,
    constraints: [{ id: 's', type: 'separated', members: ['A', 'B'], active: true }]
  }));
  assert.equal(circularSeparation.count, 2n, 'first and last positions are adjacent on a circle');

  assert.equal(Core.solve(model('combination', {
    memberRows: rows,
    constraints: [{ id: 'a', type: 'adjacent', members: ['A', 'B'], active: true }]
  })).status, 'invalid');
});

test('enumeration order is deterministic and invalid, zero, and unsupported states differ', () => {
  const outcomes = Array.from(Core.enumerate(model('combination', { n: 4, r: 2 }), 20));
  assert.deepEqual(JSON.parse(JSON.stringify(outcomes)), [
    ['Member 1', 'Member 2'],
    ['Member 1', 'Member 3'],
    ['Member 1', 'Member 4'],
    ['Member 2', 'Member 3'],
    ['Member 2', 'Member 4'],
    ['Member 3', 'Member 4']
  ]);

  assert.equal(Core.solve(model('combination', { n: 2, r: 3 })).status, 'invalid');
  assert.equal(Core.solve(model('combination', {
    n: 3,
    r: 1,
    memberRows: ['A', 'B', 'C'].map((label) => ({ id: label, label, quantity: 1, identity: 'distinct', tags: [] })),
    constraints: [
      { id: 'a', type: 'required', members: ['A'], active: true },
      { id: 'b', type: 'excluded', members: ['A'], active: true }
    ]
  })).status, 'invalid');
  assert.equal(Core.solve(model('combination', {
    n: 3,
    r: 1,
    memberRows: ['A', 'B', 'C'].map((label) => ({ id: label, label, quantity: 1, identity: 'distinct', tags: [] })),
    constraints: [{ id: 'a', type: 'required', members: ['A', 'B'], active: true }]
  })).status, 'zero');
  assert.equal(Core.solve(model('burnside')).status, 'unsupported');
});
