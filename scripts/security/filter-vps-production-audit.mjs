import { readFileSync, writeFileSync } from 'node:fs';

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error('Usage: node filter-vps-production-audit.mjs <input.json> <output.json>');
  process.exit(2);
}

const audit = JSON.parse(readFileSync(inputPath, 'utf8'));

if (audit.error) {
  console.error('pnpm audit returned an error; release security cannot be established.');
  process.exit(2);
}

const deployableRoots = new Set(['apps__api', 'apps__web', 'apps__admin']);
const blockingSeverities = new Set(['high', 'critical']);
const selected = [];

for (const advisory of Object.values(audit.advisories ?? {})) {
  if (!blockingSeverities.has(advisory.severity)) {
    continue;
  }

  const deployablePaths = (advisory.findings ?? [])
    .flatMap((finding) => finding.paths ?? [])
    .filter((path) => deployableRoots.has(path.split('>')[0]));

  if (deployablePaths.length === 0) {
    continue;
  }

  selected.push({
    id: advisory.github_advisory_id ?? advisory.id,
    module: advisory.module_name,
    severity: advisory.severity,
    title: advisory.title,
    vulnerableVersions: advisory.vulnerable_versions,
    patchedVersions: advisory.patched_versions,
    paths: [...new Set(deployablePaths)].sort(),
  });
}

selected.sort((a, b) => {
  const severityOrder = { critical: 0, high: 1 };
  return (
    severityOrder[a.severity] - severityOrder[b.severity] ||
    String(a.module).localeCompare(String(b.module)) ||
    String(a.id).localeCompare(String(b.id))
  );
});

const report = {
  policy: {
    blockedSeverities: ['critical', 'high'],
    deployableRoots: [...deployableRoots],
    note: 'Mobile-only and development-only dependency paths do not gate the VPS release.',
  },
  blockingAdvisoryCount: selected.length,
  advisories: selected,
};

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

if (selected.length > 0) {
  console.error(
    `VPS production dependency audit blocked: ${selected.length} high/critical advisory entries affect API/Web/Admin.`,
  );
  for (const advisory of selected) {
    console.error(
      `- ${advisory.severity.toUpperCase()} ${advisory.module} (${advisory.id}); paths=${advisory.paths.length}`,
    );
  }
  process.exit(1);
}

console.log('VPS production dependency audit passed: no high/critical deployable advisories.');
