import { runDoctor } from './commands/doctor.js';
import { runInit } from './commands/init.js';
import { runReview } from './commands/review.js';
import { runSkillsList } from './commands/skills-list.js';
import { renderHelp, renderReviewHelp } from './lib/help.js';

export async function run(args = []) {
  const [command, subcommand, ...rest] = args;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(renderHelp());
    return;
  }

  if (command === '--version' || command === '-v' || command === 'version') {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json');
    console.log(`@agisecurity/cli ${pkg.version}`);
    return;
  }

  if (command === 'skills' && subcommand === 'list') {
    await runSkillsList({ cwd: process.cwd(), args: rest });
    return;
  }

  if (command === 'init') {
    await runInit({ cwd: process.cwd(), args: [subcommand, ...rest].filter(Boolean) });
    return;
  }

  if (command === 'doctor') {
    await runDoctor({ cwd: process.cwd(), args: [subcommand, ...rest].filter(Boolean) });
    return;
  }

  if (command === 'review') {
    const reviewArgs = [subcommand, ...rest].filter(Boolean);
    if (reviewArgs.includes('--help') || reviewArgs.includes('-h')) {
      console.log(renderReviewHelp());
      return;
    }
    await runReview({ cwd: process.cwd(), args: reviewArgs });
    return;
  }

  console.error(`Unknown command: ${args.join(' ')}`);
  console.error('Run `agi --help` for usage.');
  process.exitCode = 1;
}
