#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const WORKFLOW_PATH = path.resolve('.github/workflows/release-security.yml');
const SEED_COMMAND =
  'cp services/ai-engine/requirements.lock security-artifacts/ai-engine-requirements.lock';
const COMPILE_COMMAND = 'python -m piptools compile';

export function validatePythonLockWorkflow(source) {
  const compileStepStart = source.indexOf('- name: Compile deterministic Python runtime lock');
  const verifyStepStart = source.indexOf('- name: Verify committed Python lock is current');

  if (compileStepStart < 0 || verifyStepStart < 0 || verifyStepStart <= compileStepStart) {
    return ['Python lock compile/verify workflow steps are missing or out of order.'];
  }

  const compileStep = source.slice(compileStepStart, verifyStepStart);
  const runStart = compileStep.indexOf('run: |');
  if (runStart < 0) {
    return ['Python lock compile step is missing its run body.'];
  }

  const runBody = compileStep.slice(runStart);
  const seedIndex = runBody.indexOf(SEED_COMMAND);
  const compileIndex = runBody.indexOf(COMPILE_COMMAND);
  const failures = [];

  if (seedIndex < 0) {
    failures.push('Python lock compile step must seed the temporary output from the committed lock.');
  }
  if (compileIndex < 0) {
    failures.push('Python lock compile command is missing.');
  }
  if (seedIndex >= 0 && compileIndex >= 0 && seedIndex > compileIndex) {
    failures.push('Python lock seed must run before pip-compile.');
  }
  if (/\s--upgrade(?:\s|\\|$)/u.test(runBody) || /\s-U(?:\s|\\|$)/u.test(runBody)) {
    failures.push('Integrity verification must not upgrade dependencies.');
  }

  return failures;
}

function runSelfTest() {
  const valid = `
- name: Compile deterministic Python runtime lock
  env:
    CUSTOM_COMPILE_COMMAND: "${COMPILE_COMMAND} services/ai-engine/pyproject.toml --generate-hashes"
  run: |
    mkdir -p security-artifacts
    ${SEED_COMMAND}
    ${COMPILE_COMMAND} services/ai-engine/pyproject.toml --generate-hashes
- name: Verify committed Python lock is current
`;
  const missingSeed = `
- name: Compile deterministic Python runtime lock
  run: |
    ${COMPILE_COMMAND} services/ai-engine/pyproject.toml --generate-hashes
- name: Verify committed Python lock is current
`;
  const upgrades = `
- name: Compile deterministic Python runtime lock
  run: |
    ${SEED_COMMAND}
    ${COMPILE_COMMAND} services/ai-engine/pyproject.toml --upgrade
- name: Verify committed Python lock is current
`;

  if (validatePythonLockWorkflow(valid).length !== 0) {
    throw new Error('self-test: valid workflow was rejected');
  }
  if (!validatePythonLockWorkflow(missingSeed).some((failure) => failure.includes('seed'))) {
    throw new Error('self-test: missing seed was not rejected');
  }
  if (!validatePythonLockWorkflow(upgrades).some((failure) => failure.includes('upgrade'))) {
    throw new Error('self-test: upgrade mode was not rejected');
  }

  console.log('Python lock workflow policy self-test passed.');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const failures = validatePythonLockWorkflow(workflow);
if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

console.log('Python lock workflow policy passed.');
