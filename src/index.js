import { runDoctor } from './commands/doctor.js';
import { runInit } from './commands/init.js';
import { runReview } from './commands/review.js';
import { runSkillsList } from './commands/skills-list.js';
import { renderHelp } from './lib/help.js';

export async function run(args = []) {
  const [command, subcommand, ...rest] = args;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(renderHelp());
    return;
  }

  if (command === '--version' || command === '-v' || command === 'version') {
    console.log('@agisecurity/cli 0.1.3');
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
    await runReview({ cwd: process.cwd(), args: [subcommand, ...rest].filter(Boolean) });
    return;
  }

  console.error(`Unknown command: ${args.join(' ')}`);
  console.error('Run `agi --help` for usage.');
  process.exitCode = 1;
}
