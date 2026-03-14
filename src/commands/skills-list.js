import { loadMergedRegistry } from '../lib/registry.js';

export async function runSkillsList({ cwd }) {
  const registry = await loadMergedRegistry(cwd);

  console.log('AGI.security skills');
  console.log('');

  for (const skill of registry.skills) {
    const source = skill.source || 'built-in';
    const enabled = skill.enabled === false ? 'disabled' : 'enabled';
    console.log(`- ${skill.id} [${skill.category}] (${source}, ${enabled})`);
    console.log(`  ${skill.name}: ${skill.description}`);
  }

  console.log('');
  console.log(`${registry.skills.length} skill(s)`);
}
