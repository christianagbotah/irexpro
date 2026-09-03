import { readFileSync } from 'node:fs';

const candidateExpression =
  "CANDIDATE_SHA: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}";
const checkoutRef = 'ref: ${{ env.CANDIDATE_SHA }}';
const credentialsPolicy = 'persist-credentials: false';

const criticalWorkflows = [
  '.github/workflows/api-ci.yml',
  '.github/workflows/backup-restore-rehearsal.yml',
  '.github/workflows/db-migration-compat.yml',
  '.github/workflows/deployment-script-safety.yml',
  '.github/workflows/release-security.yml',
  '.github/workflows/required-ci-gate.yml',
  '.github/workflows/risk-concurrency.yml',
  '.github/workflows/web-e2e.yml',
];

function count(text, needle) {
  return text.split(needle).length - 1;
}

const failures = [];

for (const workflowPath of criticalWorkflows) {
  const text = readFileSync(workflowPath, 'utf8');
  const checkoutCount = count(text, 'uses: actions/checkout@');
  const refCount = count(text, checkoutRef);
  const credentialCount = count(text, credentialsPolicy);
  const verificationCount = count(text, 'git rev-parse HEAD');

  if (!text.includes(candidateExpression)) {
    failures.push(`${workflowPath}: missing immutable candidate SHA expression`);
  }
  if (checkoutCount === 0) {
    failures.push(`${workflowPath}: no checkout step found`);
  }
  if (refCount !== checkoutCount) {
    failures.push(
      `${workflowPath}: ${refCount}/${checkoutCount} checkout steps pin env.CANDIDATE_SHA`,
    );
  }
  if (credentialCount !== checkoutCount) {
    failures.push(
      `${workflowPath}: ${credentialCount}/${checkoutCount} checkout steps disable persisted credentials`,
    );
  }
  if (verificationCount !== checkoutCount) {
    failures.push(
      `${workflowPath}: ${verificationCount}/${checkoutCount} checkout steps verify git rev-parse HEAD`,
    );
  }
}

if (failures.length > 0) {
  console.error('Exact-head workflow provenance policy failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Exact-head workflow provenance policy passed for ${criticalWorkflows.length} workflows.`);
