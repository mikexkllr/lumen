/** "Fehler melden": builds an issue text with step id and widget state – no personal data. */
export async function reportProblem(info: { stepId: string; seed: number; state: unknown; describe: string; contentVersion: string }): Promise<'opened' | 'copied'> {
  const body = [
    `**Step:** \`${info.stepId}\``,
    `**Variante (seed):** ${info.seed}`,
    `**Content-Version:** ${info.contentVersion}`,
    `**Zustand:** ${info.describe}`,
    '',
    '```json',
    JSON.stringify(info.state, null, 2),
    '```',
    '',
    'Was ist falsch? (bitte beschreiben)',
  ].join('\n');
  const base = import.meta.env.VITE_LUMEN_ISSUES_URL;
  if (base) {
    const url = `${base}?title=${encodeURIComponent(`Inhalt: ${info.stepId}`)}&body=${encodeURIComponent(body)}&labels=content`;
    window.open(url, '_blank', 'noopener');
    return 'opened';
  }
  await navigator.clipboard?.writeText(body).catch(() => {});
  return 'copied';
}
