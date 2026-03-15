import fs from 'node:fs';
import path from 'node:path';
import { getAgiDir } from '../lib/paths.js';
import { readJson } from '../lib/fs.js';

const SKIP_DIRS = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  '.next',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  'dist',
  'build',
  'coverage',
]);

const SKIP_PATH_PATTERNS = [
  /^\.agi-security\/outputs\//,
  /^logs\//,
  /^backups\//,
];

const MAX_FILE_BYTES = 200_000; // skip files larger than 200KB (e.g. large test fixtures)

function readText(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_BYTES) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function shouldSkipRelativePath(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  return SKIP_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

const MAX_FILES_PER_SCAN = 2000;

function listFiles(rootDir, predicate, results = [], relativeBase = rootDir) {
  if (results.length >= MAX_FILES_PER_SCAN) return results;

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (results.length >= MAX_FILES_PER_SCAN) break;

    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    const relativePath = path.relative(relativeBase, fullPath);

    if (shouldSkipRelativePath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      listFiles(fullPath, predicate, results, relativeBase);
      continue;
    }

    if (predicate(fullPath, entry.name)) {
      results.push(relativePath);
    }
  }

  return results.sort();
}

function loadGitignorePatterns(cwd) {
  const gitignorePath = path.join(cwd, '.gitignore');

  if (!fileExists(gitignorePath)) {
    return [];
  }

  return readText(gitignorePath)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function isProbablyIgnored(relativePath, patterns) {
  const normalizedPath = relativePath.replace(/\\/g, '/');

  return patterns.some((pattern) => {
    const normalizedPattern = pattern.replace(/^\.\//, '').replace(/\\/g, '/');

    if (normalizedPattern.endsWith('/')) {
      return normalizedPath.startsWith(normalizedPattern);
    }

    if (normalizedPattern.startsWith('*')) {
      return normalizedPath.endsWith(normalizedPattern.slice(1));
    }

    return (
      normalizedPath === normalizedPattern ||
      normalizedPath.endsWith(`/${normalizedPattern}`) ||
      normalizedPath.startsWith(`${normalizedPattern}/`)
    );
  });
}

function collectPackageJsonScripts(cwd) {
  const packageJsonPaths = listFiles(cwd, (_, name) => name === 'package.json');
  const suspiciousScripts = [];
  const riskyLifecycleScripts = [];

  for (const relativePath of packageJsonPaths) {
    try {
      const manifest = readJson(path.join(cwd, relativePath));
      const scripts = manifest.scripts || {};

      for (const [name, command] of Object.entries(scripts)) {
        if (typeof command !== 'string') {
          continue;
        }

        if (/curl\s+[^|]+\|\s*(sh|bash)/i.test(command) || /wget\s+[^|]+\|\s*(sh|bash)/i.test(command)) {
          suspiciousScripts.push({ relativePath, name, command });
        }

        if (/^(preinstall|install|postinstall|prepare)$/i.test(name) && /(curl|wget|bash|sh|node|python|tsx|ts-node)\b/i.test(command)) {
          riskyLifecycleScripts.push({ relativePath, name, command });
        }
      }
    } catch {
      // ignore malformed package manifests in this v0 workflow
    }
  }

  return { suspiciousScripts, riskyLifecycleScripts };
}

function collectGithubWorkflowRisks(cwd) {
  const workflowDir = path.join(cwd, '.github', 'workflows');

  if (!fileExists(workflowDir)) {
    return [];
  }

  const workflowPaths = listFiles(workflowDir, (_, name) => /\.ya?ml$/i.test(name), [], workflowDir);
  const risks = [];

  for (const relativePath of workflowPaths) {
    const fullPath = path.join(workflowDir, relativePath);
    const text = readText(fullPath);
    const normalizedRelativePath = path.join('.github', 'workflows', relativePath);

    if (/pull_request_target\s*:/i.test(text)) {
      risks.push({ relativePath: normalizedRelativePath, type: 'pull_request_target', evidence: 'uses pull_request_target trigger' });
    }

    if (/permissions\s*:\s*write-all/i.test(text)) {
      risks.push({ relativePath: normalizedRelativePath, type: 'write_all_permissions', evidence: 'grants permissions: write-all' });
    }

    if (/secrets\s*:\s*inherit/i.test(text)) {
      risks.push({ relativePath: normalizedRelativePath, type: 'secrets_inherit', evidence: 'uses secrets: inherit' });
    }

    if (/uses\s*:\s*docker:\/\/|run\s*:\s*.*\bcurl\b.*\|\s*(sh|bash)\b/im.test(text)) {
      risks.push({ relativePath: normalizedRelativePath, type: 'remote_execution_pattern', evidence: 'contains a remote execution or docker:// action pattern worth review' });
    }

    // Check for explicit write permissions line-by-line to avoid ReDoS on nested quantifiers
    if (/permissions:/i.test(text) && /(contents|actions|packages|id-token):\s*write/i.test(text)) {
      risks.push({ relativePath: normalizedRelativePath, type: 'broad_write_permissions', evidence: 'grants one or more explicit write permissions in workflow permissions block' });
    }
  }

  return risks;
}

function collectDependencyRisks(cwd) {
  const packageJsonPaths = listFiles(cwd, (_, name) => name === 'package.json');
  const risks = [];
  const lockfiles = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock'];

  for (const relativePath of packageJsonPaths) {
    try {
      const manifestPath = path.join(cwd, relativePath);
      const manifest = readJson(manifestPath);
      const deps = {
        ...(manifest.dependencies || {}),
        ...(manifest.devDependencies || {}),
        ...(manifest.optionalDependencies || {}),
      };
      const packageDir = path.dirname(manifestPath);
      const hasLockfile = lockfiles.some((name) => fileExists(path.join(packageDir, name)));
      const hasDeps = Object.keys(deps).length > 0;

      if (!hasLockfile && hasDeps) {
        risks.push({
          relativePath,
          type: 'missing_lockfile',
          evidence: 'package manifest found without a neighboring lockfile',
        });
      }

      for (const [name, version] of Object.entries(deps)) {
        if (typeof version !== 'string') {
          continue;
        }

        const trimmed = version.trim();

        if (/^(latest|next|canary|beta|alpha)$/i.test(trimmed)) {
          risks.push({
            relativePath,
            type: 'floating_release_channel',
            evidence: `${name}@${version}`,
          });
          continue;
        }

        if (/^[~^*]/.test(trimmed)) {
          risks.push({
            relativePath,
            type: 'broad_semver_range',
            evidence: `${name}@${version}`,
          });
        }

        if (/^(github:|git\+https?:|git\+ssh:|https?:)/i.test(trimmed)) {
          risks.push({
            relativePath,
            type: 'remote_dependency_source',
            evidence: `${name}@${version}`,
          });
        }

        if (/^(file:|link:|workspace:)/i.test(trimmed)) {
          risks.push({
            relativePath,
            type: 'local_dependency_link',
            evidence: `${name}@${version}`,
          });
        }
      }
    } catch {
      // ignore malformed package manifests in this v0 workflow
    }
  }

  return risks;
}

function collectAuthBoundaryRisks(cwd) {
  const candidateFiles = listFiles(
    cwd,
    // Exclude .md files and package.json/lock files — auth/session keywords in docs or manifests are not real risks
    (fullPath, name) =>
      (/\.(js|jsx|ts|tsx|mjs|cjs|ya?ml|env)$/i.test(name) || /dockerfile/i.test(name)) &&
      !/^package(-lock)?\.json$|^yarn\.lock$|^pnpm-lock\.yaml$/i.test(name),
  );
  const risks = [];

  for (const relativePath of candidateFiles.slice(0, 400)) {
    const fullPath = path.join(cwd, relativePath);
    let text = '';

    try {
      text = readText(fullPath);
    } catch {
      continue;
    }

    if (/jwt\.sign\(|jsonwebtoken|Authorization\s*:\s*`?Bearer\s+\$\{|cookie-session|express-session|NextAuth|next-auth/i.test(text) && !/sameSite|httpOnly|secure/i.test(text)) {
      risks.push({
        relativePath,
        type: 'session_or_token_handling_needs_review',
        evidence: 'found auth/session/token handling patterns without obvious secure-cookie/session hardening nearby',
      });
    }

    if (/CORS_ORIGIN\s*=\s*\*|Access-Control-Allow-Origin['"`]?\s*[:=]\s*['"`]\*['"`]|origin:\s*['"`]\*['"`]/i.test(text)) {
      risks.push({
        relativePath,
        type: 'permissive_cors',
        evidence: 'contains wildcard CORS-style configuration',
      });
    }
  }

  return risks;
}

function collectPotentialSecretLiterals(cwd) {
  const candidateFiles = listFiles(
    cwd,
    // Exclude .md files — docs universally contain example credentials in code snippets
    // and generate high false-positive rates; real secrets in docs are almost always
    // also present in the actual code/config files where they matter.
    (_, name) => /\.(js|jsx|ts|tsx|mjs|cjs|json|ya?ml|env|py|sh|rb|go|java|tf)$/i.test(name),
  );
  const findings = [];
  // Values that look like identifier/field names rather than real credentials:
  // - purely alphabetic + underscores only (e.g. "password", "password1_field_name", "_password_reset_token")
  // - no digits mixed with letters in a high-entropy pattern
  // Real credentials almost always contain digits, mixed case, or special chars.
  const looksLikeIdentifier = (value) => /^[_a-zA-Z][_a-zA-Z0-9]*$/.test(value) && !/[0-9]/.test(value.replace(/^_+/, '').slice(0, 4));

  const patterns = [
    // Keyword immediately before assignment (e.g. secret = "...", token: "...")
    { type: 'api_key_literal', regex: /(api[_-]?key|secret|token|client[_-]?secret)\s*[:=]\s*['"]([A-Za-z0-9_\-\/+=]{8,})['"]/i },
    // Variable name contains secret/password/key/token (e.g. SECRET_KEY = "...", DB_PASSWORD = "...")
    // Excludes values with spaces (error messages, UI strings) — real credentials almost never contain spaces
    { type: 'hardcoded_credential_var', regex: /\b(?:[A-Za-z_][A-Za-z0-9_]*)?(SECRET|PASSWORD|PASSWD|API_KEY|AUTH_TOKEN|ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET)[A-Za-z0-9_]*\s*[:=]\s*['"]([^\s'"]{6,})['"]/i },
    // jwt/algorithm none bypass pattern
    { type: 'jwt_none_alg', regex: /algorithms\s*:\s*\[([^\]]*['"]none['"][^\]]*)\]/i },
    { type: 'private_key_block', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
    { type: 'github_pat', regex: /ghp_[A-Za-z0-9]{20,}/ },
    { type: 'slack_token', regex: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
    { type: 'aws_access_key', regex: /AKIA[0-9A-Z]{16}/ },
  ];

  for (const relativePath of candidateFiles.slice(0, 500)) {
    const fullPath = path.join(cwd, relativePath);
    let text = '';

    try {
      text = readText(fullPath);
    } catch {
      continue;
    }

    if (/example|sample|fixture|test|mock|\.spec\.|\.test\.|__tests__/i.test(relativePath)) {
      continue;
    }



    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        // For patterns that capture the value (group 2 for api_key_literal/hardcoded_credential_var),
        // skip if the value looks like a plain identifier/field name rather than real secret material.
        const capturedValue = match[2];
        if (capturedValue && looksLikeIdentifier(capturedValue)) {
          continue;
        }
        findings.push({
          relativePath,
          type: pattern.type,
          evidence: `matched ${pattern.type}: ${String(match[0]).slice(0, 60)}`,
        });
        break;
      }
    }
  }

  return findings;
}

function parseProjectProfile(projectProfileText) {
  const lines = projectProfileText.split('\n');
  const profile = {
    authSurface: '',
    secretsHandling: '',
    thirdPartyIntegrations: '',
    knownRiskyAreas: '',
    keyQuestions: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('- auth surface:')) {
      profile.authSurface = trimmed.replace('- auth surface:', '').trim();
    } else if (trimmed.startsWith('- secrets handling:')) {
      profile.secretsHandling = trimmed.replace('- secrets handling:', '').trim();
    } else if (trimmed.startsWith('- third-party integrations:')) {
      profile.thirdPartyIntegrations = trimmed.replace('- third-party integrations:', '').trim();
    } else if (trimmed.startsWith('- known risky areas:')) {
      profile.knownRiskyAreas = trimmed.replace('- known risky areas:', '').trim();
    } else if (trimmed.startsWith('- ') && trimmed.includes('?')) {
      profile.keyQuestions.push(trimmed.replace(/^-\s*/, '').trim());
    }
  }

  return profile;
}

function scoreFinding(finding, projectProfile) {
  const text = [
    finding.title,
    finding.evidence,
    finding.whyItMatters,
    finding.recommendation,
    projectProfile.authSurface,
    projectProfile.secretsHandling,
    projectProfile.thirdPartyIntegrations,
    projectProfile.knownRiskyAreas,
    projectProfile.keyQuestions.join(' '),
  ].join(' ').toLowerCase();

  let score = 0;

  if (finding.severity === 'high') score += 300;
  if (finding.severity === 'medium') score += 200;
  if (finding.severity === 'low') score += 100;

  const riskyAreas = projectProfile.knownRiskyAreas.toLowerCase();
  const authSurface = projectProfile.authSurface.toLowerCase();
  const secretsHandling = projectProfile.secretsHandling.toLowerCase();
  const integrations = projectProfile.thirdPartyIntegrations.toLowerCase();

  if (authSurface && /(auth|session|oauth|login|token|sso|cookie|jwt)/.test(text)) score += 80;
  if (secretsHandling && /(secret|token|key|credential|env|certificate)/.test(text)) score += 80;
  if (integrations && /(dependency|workflow|github|package|supply|third-party)/.test(text)) score += 50;
  if (riskyAreas) {
    const keywords = riskyAreas
      .split(/[,/]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 12);

    for (const keyword of keywords) {
      if (keyword.length >= 3 && text.includes(keyword)) {
        score += 40;
      }
    }
  }

  return score;
}

function prioritizeFindings(findings, projectProfile) {
  return findings
    .map((finding) => ({
      ...finding,
      priorityScore: scoreFinding(finding, projectProfile),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore || a.title.localeCompare(b.title));
}

function buildFindings({ envFiles, keyFiles, suspiciousScripts, riskyLifecycleScripts, githubWorkflowRisks, dependencyRisks, authBoundaryRisks, potentialSecretLiterals, hasGitignore, gitignorePatterns }) {
  const findings = [];

  if (!hasGitignore) {
    findings.push({
      severity: 'medium',
      title: 'Repository is missing a root .gitignore',
      evidence: 'No .gitignore file was found at the repository root.',
      whyItMatters: 'Without a root .gitignore, local secrets, generated artifacts, and review outputs are easier to commit by accident.',
      recommendation: 'Add a root .gitignore that covers .env files, key material, build outputs, and .agi-security/outputs/.',
    });
  }

  const unignoredEnvFiles = envFiles.filter((filePath) => !isProbablyIgnored(filePath, gitignorePatterns));
  if (unignoredEnvFiles.length) {
    findings.push({
      severity: 'high',
      title: 'Potential environment secret files are not clearly ignored',
      evidence: `Found environment-style files without matching root .gitignore coverage: ${unignoredEnvFiles.join(', ')}`,
      whyItMatters: 'Environment files often contain tokens, API keys, or credentials that can leak into version control or artifacts.',
      recommendation: 'Move secrets out of tracked repo paths where possible and ensure these files are ignored by the root .gitignore.',
    });
  }

  if (keyFiles.length) {
    findings.push({
      severity: 'high',
      title: 'Private key or certificate-style files are present in the repository tree',
      evidence: `Found key-material-looking files: ${keyFiles.join(', ')}`,
      whyItMatters: 'Private keys and similar artifacts materially increase secret-exposure risk, even if they are intended for local development only.',
      recommendation: 'Confirm whether these files are test fixtures or live credentials, remove live key material from the repo tree, and ensure any safe fixtures are clearly labeled and ignored if local-only.',
    });
  }

  if (suspiciousScripts.length) {
    findings.push({
      severity: 'medium',
      title: 'Package scripts include pipe-to-shell install or execution patterns',
      evidence: suspiciousScripts
        .map(({ relativePath, name, command }) => `${relativePath}#${name}: ${command}`)
        .join(' | '),
      whyItMatters: 'Pipe-to-shell patterns reduce reviewability and can hide supply-chain risk in local or CI execution paths.',
      recommendation: 'Prefer pinned downloads, checked-in scripts, or explicitly reviewed setup steps instead of curl|sh or wget|bash flows.',
    });
  }

  if (riskyLifecycleScripts.length) {
    findings.push({
      severity: 'medium',
      title: 'Package lifecycle scripts execute non-trivial commands during install/prepare',
      evidence: riskyLifecycleScripts
        .map(({ relativePath, name, command }) => `${relativePath}#${name}: ${command}`)
        .join(' | '),
      whyItMatters: 'Lifecycle hooks run automatically in developer and CI environments and are a common place for supply-chain surprises or unexpected secret access.',
      recommendation: 'Keep lifecycle scripts minimal, auditable, and necessary; move setup logic into explicit reviewed commands where possible.',
    });
  }

  if (githubWorkflowRisks.length) {
    findings.push({
      severity: 'medium',
      title: 'GitHub Actions workflows contain higher-risk trigger or permission patterns',
      evidence: githubWorkflowRisks
        .map(({ relativePath, evidence }) => `${relativePath}: ${evidence}`)
        .join(' | '),
      whyItMatters: 'Workflow triggers and broad permissions can expand CI trust boundaries, especially around forked pull requests and inherited secrets.',
      recommendation: 'Review GitHub Actions workflows for least privilege, avoid `pull_request_target` unless truly needed, and limit secret inheritance and broad write permissions.',
    });
  }

  const missingLockfiles = dependencyRisks.filter((risk) => risk.type === 'missing_lockfile');
  if (missingLockfiles.length) {
    findings.push({
      severity: 'medium',
      title: 'Package manifests are missing neighboring lockfiles',
      evidence: missingLockfiles.map(({ relativePath }) => relativePath).join(', '),
      whyItMatters: 'Without lockfiles, dependency resolution can drift across machines and CI runs, weakening reproducibility and supply-chain reviewability.',
      recommendation: 'Commit a lockfile for each actively used Node package manifest or document why the package is intentionally excluded from reproducible installs.',
    });
  }

  const floatingDependencySpecs = dependencyRisks.filter((risk) => risk.type === 'floating_release_channel' || risk.type === 'broad_semver_range');
  if (floatingDependencySpecs.length) {
    findings.push({
      severity: 'low',
      title: 'Some dependencies use floating or broad version specifiers',
      evidence: floatingDependencySpecs
        .slice(0, 12)
        .map(({ relativePath, evidence }) => `${relativePath}: ${evidence}`)
        .join(' | '),
      whyItMatters: 'Broad ranges are common in manifests, but they increase drift risk when lockfiles are absent or frequently regenerated without review.',
      recommendation: 'Keep lockfiles committed and pin especially sensitive tooling or security-critical dependencies more tightly where practical.',
    });
  }

  const remoteDependencySources = dependencyRisks.filter((risk) => risk.type === 'remote_dependency_source');
  if (remoteDependencySources.length) {
    findings.push({
      severity: 'medium',
      title: 'Some dependencies resolve from remote git or URL sources',
      evidence: remoteDependencySources
        .slice(0, 12)
        .map(({ relativePath, evidence }) => `${relativePath}: ${evidence}`)
        .join(' | '),
      whyItMatters: 'Remote dependency sources can bypass normal registry review and make reproducibility and supply-chain auditing harder.',
      recommendation: 'Prefer pinned registry releases where possible, or document and review each git/URL-sourced dependency explicitly.',
    });
  }

  if (authBoundaryRisks.length) {
    // Check whether findings are exclusively in example/test/fixture paths
    const authProdRisks = authBoundaryRisks.filter(
      ({ relativePath }) => !/\b(examples?|tests?|__tests__|fixtures?|mocks?|spec)\b/i.test(relativePath),
    );
    const authOnlyExamples = authProdRisks.length === 0;
    findings.push({
      severity: authOnlyExamples ? 'low' : 'medium',
      title: authOnlyExamples
        ? 'Auth/session patterns found — limited to examples or test files'
        : 'Auth/session boundary code paths need a closer review',
      evidence: authBoundaryRisks
        .slice(0, 12)
        .map(({ relativePath, evidence }) => `${relativePath}: ${evidence}`)
        .join(' | '),
      whyItMatters: 'Authentication, session, token, and CORS boundaries are where local convenience often turns into production trust problems.',
      recommendation: authOnlyExamples
        ? 'Findings are in example or test directories — verify production code does not replicate these patterns without secure-cookie/session hardening.'
        : 'Review the highlighted files for secure cookie/session settings, token handling discipline, and environment-specific CORS restrictions.',
    });
  }

  if (potentialSecretLiterals.length) {
    findings.push({
      severity: 'high',
      title: 'Potential hard-coded secret material appears in repository files',
      evidence: potentialSecretLiterals
        .slice(0, 12)
        .map(({ relativePath, evidence }) => `${relativePath}: ${evidence}`)
        .join(' | '),
      whyItMatters: 'Hard-coded credentials and tokens are one of the fastest ways to turn a repo mistake into a real compromise.',
      recommendation: 'Treat each match as suspect until proven otherwise, rotate any live credential, move secrets into environment or secret-management layers, and keep safe fixtures clearly marked.',
    });
  }

  return findings;
}

function formatList(items) {
  if (!items.length) {
    return '- none';
  }

  return items.map((item) => `- ${item}`).join('\n');
}

function renderReview({ cwd, workflowText, projectProfileText, projectProfile, findings, observations, outputRelativePath }) {
  const summary = findings.length
    ? `Completed a lightweight repo-security review and found ${findings.length} issue(s) worth follow-up.`
    : 'Completed a lightweight repo-security review and found no obvious repo-level issues in the current v0 checks.';

  const lines = [
    '# AGI.security Repo Review',
    '',
    `- target: ${path.basename(cwd)}`,
    '- intent: repo-security-review',
    `- generated-at: ${new Date().toISOString()}`,
    `- output: ${outputRelativePath}`,
    '',
    '## Executive Summary',
    `- summary: ${summary}`,
    '',
    '## Workflow Context',
    '### Workflow Spec Snapshot',
    '```md',
    workflowText.trim(),
    '```',
    '',
    '### Project Profile Snapshot',
    '```md',
    projectProfileText.trim(),
    '```',
    '',
    '## Observations',
    formatList(observations),
    '',
    '## Priority Context',
    formatList([
      projectProfile.authSurface ? `auth surface: ${projectProfile.authSurface}` : 'auth surface: unspecified',
      projectProfile.secretsHandling ? `secrets handling: ${projectProfile.secretsHandling}` : 'secrets handling: unspecified',
      projectProfile.thirdPartyIntegrations ? `third-party integrations: ${projectProfile.thirdPartyIntegrations}` : 'third-party integrations: unspecified',
      projectProfile.knownRiskyAreas ? `known risky areas: ${projectProfile.knownRiskyAreas}` : 'known risky areas: unspecified',
    ]),
    '',
    '## Findings',
  ];

  if (!findings.length) {
    lines.push('- No findings triggered by the current v0 repo review heuristics.');
  } else {
    findings.forEach((finding, index) => {
      lines.push(`### ${index + 1}. ${finding.title}`);
      lines.push(`- severity: ${finding.severity}`);
      lines.push(`- priority score: ${finding.priorityScore}`);
      lines.push(`- evidence: ${finding.evidence}`);
      lines.push(`- why it matters: ${finding.whyItMatters}`);
      lines.push(`- recommendation: ${finding.recommendation}`);
      lines.push('');
    });
  }

  lines.push('## Next Actions');
  if (!findings.length) {
    lines.push('- Expand review coverage with dependency, auth, and CI-specific checks.');
    lines.push('- Fill in .agi-security/context/project-profile.md with repo-specific trust boundaries before the next review.');
  } else {
    lines.push('- Triage the findings above by confirming whether the evidence reflects real production risk or safe local/test fixtures.');
    lines.push('- Fix root ignore/secret-handling issues before broadening the CLI review surface.');
    lines.push('- Extend the next review pass with dependency and auth-boundary checks.');
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

export async function runReview({ cwd, args = [] }) {
  // If a target path is provided as the first arg, scan that dir but keep the
  // AGI.security workspace (config, outputs) anchored to cwd.
  // Resolve symlinks so macOS /tmp -> /private/tmp etc. don't cause traversal issues
  const targetDir = args[0] ? fs.realpathSync(path.resolve(cwd, args[0])) : cwd;
  const workspaceDir = cwd;

  const agiDir = getAgiDir(workspaceDir);
  const configPath = path.join(agiDir, 'config.json');

  if (!fileExists(configPath)) {
    console.error('AGI.security workspace not initialized in this directory. Run `agi init` first.');
    process.exitCode = 1;
    return;
  }

  const config = readJson(configPath);
  const workflow = config.workflows?.repoSecurityReview || {};
  const workflowPath = path.join(workspaceDir, workflow.spec || '.agi-security/workflows/repo-security-review.md');
  const projectProfilePath = path.join(workspaceDir, workflow.projectProfile || '.agi-security/context/project-profile.md');
  const outputPattern = workflow.outputPattern || '.agi-security/outputs/review-<timestamp>.md';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputRelativePath = outputPattern.replace('<timestamp>', timestamp);
  const outputPath = path.join(workspaceDir, outputRelativePath);

  if (!fileExists(workflowPath) || !fileExists(projectProfilePath)) {
    console.error('Required workflow files are missing. Run `agi doctor` to inspect workspace health.');
    process.exitCode = 1;
    return;
  }

  const workflowText = readText(workflowPath);
  const projectProfileText = readText(projectProfilePath);
  const projectProfile = parseProjectProfile(projectProfileText);
  const hasGitignore = fileExists(path.join(targetDir, '.gitignore'));
  const gitignorePatterns = loadGitignorePatterns(targetDir);
  const envFiles = listFiles(
    targetDir,
    (_, name) => /^\.env(\..+)?$/i.test(name) && !/\.example$|\.sample$|\.template$/i.test(name),
  );
  const keyFiles = listFiles(
    targetDir,
    (_, name) => /\.(pem|key|p12|pfx)$/i.test(name) && !/(^|[-_.])(cacert|certifi)([-_.]|$)/i.test(name),
  );
  const { suspiciousScripts, riskyLifecycleScripts } = collectPackageJsonScripts(targetDir);
  const githubWorkflowRisks = collectGithubWorkflowRisks(targetDir);
  const dependencyRisks = collectDependencyRisks(targetDir);
  const authBoundaryRisks = collectAuthBoundaryRisks(targetDir);
  const potentialSecretLiterals = collectPotentialSecretLiterals(targetDir);
  const findings = prioritizeFindings(
    buildFindings({
      envFiles,
      keyFiles,
      suspiciousScripts,
      riskyLifecycleScripts,
      githubWorkflowRisks,
      dependencyRisks,
      authBoundaryRisks,
      potentialSecretLiterals,
      hasGitignore,
      gitignorePatterns,
    }),
    projectProfile,
  );
  const observations = [
    hasGitignore ? 'root .gitignore present' : 'root .gitignore missing',
    `${envFiles.length} environment-style file(s) found`,
    `${keyFiles.length} key-material-looking file(s) found`,
    `${suspiciousScripts.length} suspicious package script pattern(s) found`,
    `${riskyLifecycleScripts.length} risky lifecycle script(s) found`,
    `${githubWorkflowRisks.length} GitHub workflow risk pattern(s) found`,
    `${dependencyRisks.length} dependency risk signal(s) found`,
    `${authBoundaryRisks.length} auth/CORS boundary risk signal(s) found`,
    `${potentialSecretLiterals.length} potential hard-coded secret match(es) found`,
  ];

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const report = renderReview({ cwd: targetDir, workflowText, projectProfileText, projectProfile, findings, observations, outputRelativePath });
  fs.writeFileSync(outputPath, report, 'utf8');

  console.log('AGI.security review complete');
  console.log(`output: ${outputRelativePath}`);
  console.log(`findings: ${findings.length}`);

  if (findings.length) {
    console.log('top issues:');
    findings.forEach((finding, index) => {
      console.log(`- [${index + 1}] ${finding.severity.toUpperCase()} — ${finding.title}`);
    });
  }
}
