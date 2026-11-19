import { describe, expect, it } from 'vitest';
import { initialState, resolveProblem } from '../src/runtime.ts';
import { ProblemStepSchema, type ProblemStep } from '../src/schema.ts';
import { buildExplainContext, buildTutorContext, findLeak, intentText, isEcho, reasoningQuestion, ruleReply, tutorMessages } from '../src/tutor.ts';
import { optionIds } from '../src/widgets/choice.ts';

const step = (s: Record<string, unknown>): ProblemStep => ({ ...ProblemStepSchema.parse({ kind: 'problem', ...s }), id: 't/s1' }) as ProblemStep;

const force = step({
  widget: 'numeric',
  prompt: 'Ein Auto mit 1000 kg beschleunigt mit 3 m/s². Welche Kraft braucht es?',
  params: { unit: 'N' },
  answer: { value: 3000 },
  feedback: [{ when: 'numval(state.input) == 1003', text: 'Masse und Beschleunigung werden multipliziert, nicht addiert.' }],
  hints: ['Masse mal Beschleunigung.'],
  explanation: '1000 · 3 = 3000 N.',
});

const keys = step({
  widget: 'choice',
  prompt: 'Anna will Ben eine geheime Nachricht schicken. Mit welchem Schlüssel verschließt sie?',
  params: {
    shuffle: false,
    options: [
      { label: 'Mit Bens öffentlichem Schlüssel', correct: true },
      { label: 'Mit ihrem privaten Schlüssel', feedback: 'Dann könnte jeder öffnen.' },
      { label: 'Mit Bens privatem Schlüssel' },
    ],
  },
  hints: ['Wer soll die Nachricht öffnen können?'],
  explanation: 'Nur Ben hat den passenden privaten Schlüssel.',
});

describe('tutor context', () => {
  it('grounds a wrong numeric answer in the authored misconception', () => {
    const rp = resolveProblem(force);
    const ctx = buildTutorContext(rp, { input: '1003' }, { status: 'wrong', attempts: 1, hintsShown: 0, course: 'Bewegung', lesson: 'Kraft und Masse' });
    expect(ctx.mistake).toContain('multipliziert');
    expect(ctx.learner).toContain('1003');
    expect(ctx.guard.numbers).toEqual([3000]);
    const sys = tutorMessages(ctx, [], intentText('why-wrong'))[0].content;
    expect(sys).toContain('GEHEIM – NICHT NENNEN');
    expect(sys).toContain('Bewegung › Kraft und Masse');
  });

  it('keeps numbers that are part of the task out of the guard', () => {
    const s = step({ widget: 'numeric', prompt: 'Wie viel ist 12 + 0?', answer: { value: 12 }, hints: ['Null ändert nichts.'] });
    const ctx = buildTutorContext(resolveProblem(s), null, { status: 'unanswered', attempts: 0, hintsShown: 0 });
    expect(ctx.guard.numbers).toEqual([]);
  });

  it('marks correct choice options as secret', () => {
    const rp = resolveProblem(keys);
    const wrong = optionIds(rp.params)[1];
    const ctx = buildTutorContext(rp, { selected: [wrong] }, { status: 'wrong', attempts: 1, hintsShown: 0 });
    expect(ctx.guard.letters).toEqual(['A']);
    expect(ctx.options?.[0]).toBe('A) Mit Bens öffentlichem Schlüssel');
  });

  it('opens up once the task is solved', () => {
    const rp = resolveProblem(force);
    const ctx = buildTutorContext(rp, { input: '3000' }, { status: 'correct', attempts: 1, hintsShown: 0 });
    expect(findLeak('1000 · 3 = 3000 N', ctx)).toBeNull();
    expect(tutorMessages(ctx, [], intentText('why-right'))[0].content).toContain('darf erklärt werden');
  });
});

describe('leak guard', () => {
  const num = buildTutorContext(resolveProblem(force), { input: '1003' }, { status: 'wrong', attempts: 1, hintsShown: 0 });
  const choice = buildTutorContext(resolveProblem(keys), initialState(resolveProblem(keys)), { status: 'unanswered', attempts: 0, hintsShown: 0 });

  it('catches the answer in a reply', () => {
    expect(findLeak('Die Kraft ist 1000 kg × 3 m/s² = 3000 N.', num)).toMatch(/number/);
    expect(findLeak('Das ergibt 3.000 Newton.', num)).toMatch(/number/);
    expect(findLeak('Die Nachricht kann nur mit Bens öffentlichem Schlüssel geöffnet werden.', choice)).toMatch(/phrase/);
    expect(findLeak('Option A ist richtig.', choice)).toMatch(/letter/);
    expect(findLeak('Ben nutzt seinen öffentlichen Schlüssel dafür.', choice)).toMatch(/phrase/);
  });

  it('lets real nudges through', () => {
    expect(findLeak('Werden Masse und Beschleunigung addiert oder multipliziert? Was ergibt 1000 mal 3?', num)).toBeNull();
    expect(findLeak('Wer soll die Nachricht am Ende öffnen können – Anna oder Ben?', choice)).toBeNull();
    expect(findLeak('In 30 Sekunden schaffst du das.', num)).toBeNull();
  });

  it('catches copied explanations for interactive widgets', () => {
    const ctx = buildExplainContext('x', { locale: 'de' });
    expect(findLeak('irgendwas', ctx)).toBeNull();
    const net = { ...num, guard: { numbers: [], phrases: [], letters: [] }, explanation: 'Du geht über Bea und Dana zum Star in drei Schritten.' };
    expect(findLeak('Du geht über Bea und Dana zum Star.', net)).toBe('copies the solution');
  });
});

describe('rule tutor', () => {
  it('walks through misconception, then hints, then stops', () => {
    const rp = resolveProblem(force);
    const ctx = buildTutorContext(rp, { input: '1003' }, { status: 'wrong', attempts: 1, hintsShown: 0 });
    expect(ruleReply(ctx, 'why-wrong', 0)).toContain('multipliziert');
    expect(ruleReply(ctx, 'hint', 0)).toContain('Masse mal Beschleunigung');
    expect(ruleReply(ctx, 'hint', 1)).toContain('Lösung zeigen');
    for (let turn = 0; turn < 3; turn++) for (const i of ['why-wrong', 'hint', 'rephrase', 'explain-task', 'chat'] as const) expect(findLeak(ruleReply(ctx, i, turn), ctx)).toBeNull();
  });
  it('explains after solving', () => {
    const ctx = buildTutorContext(resolveProblem(force), { input: '3000' }, { status: 'correct', attempts: 1, hintsShown: 0 });
    expect(ruleReply(ctx, 'why-right')).toContain('1000 · 3');
  });
});

describe('proposed answers', () => {
  it('never confirms, sends the learner to try it', () => {
    const ctx = buildTutorContext(resolveProblem(force), { input: '1003' }, { status: 'wrong', attempts: 1, hintsShown: 0 });
    const r = ruleReply(ctx, 'chat', 0, 'Ist es 3000?');
    expect(r).toContain('Probier es aus');
    expect(findLeak(r, ctx)).toBeNull();
    expect(tutorMessages(ctx, [], 'Ist es 3000?')[0].content).toContain('weder ja noch nein');
  });
});

describe('asking for the reasoning', () => {
  const wrong = buildTutorContext(resolveProblem(force), { input: '1003' }, { status: 'wrong', attempts: 1, hintsShown: 0 });

  it('quotes the learner answer and asks how they got there', () => {
    expect(wrong.answer).toBe('1003 N');
    expect(reasoningQuestion(wrong)).toBe('Du hast »1003 N« geantwortet. Wie bist du darauf gekommen?');
    expect(reasoningQuestion({ ...wrong, attempts: 2 })).toContain('Diesmal');
    expect(reasoningQuestion({ ...wrong, attempts: 2 }, { revisit: true })).toContain('Hier hattest du');
    const rp = resolveProblem(keys);
    const ctx = buildTutorContext(rp, { ...(initialState(rp) as object), selected: [optionIds(rp.params)[1]] }, { status: 'wrong', attempts: 1, hintsShown: 0 });
    expect(reasoningQuestion(ctx)).toBe('Du hast »Mit ihrem privaten Schlüssel« gewählt. Wie bist du darauf gekommen?');
    for (const q of [reasoningQuestion(wrong), reasoningQuestion(ctx)]) expect(findLeak(q, ctx.answer === undefined ? wrong : ctx)).toBeNull();
  });

  it('answers the reasoning with the misconception, even when it has numbers', () => {
    const r = ruleReply(wrong, 'reasoning', 1, 'Ich habe 1000 + 3 gerechnet.');
    expect(r).toContain('multipliziert');
    expect(r).not.toContain('Probier es aus');
    expect(findLeak(r, wrong)).toBeNull();
    expect(ruleReply(wrong, 'reasoning', 1, 'Ehrlich gesagt habe ich geraten.')).toContain('Masse mal Beschleunigung');
  });

  it('tells the model to work with the explanation', () => {
    const sys = tutorMessages(wrong, [], 'Ich habe addiert.', { intent: 'reasoning' })[0].content;
    expect(sys).toContain('wie sie auf ihre falsche Antwort gekommen ist');
    expect(tutorMessages(wrong, [], 'Hallo')[0].content).not.toContain('falsche Antwort gekommen');
  });
});

describe('echo guard', () => {
  it('spots a reply that repeats the last question', () => {
    const q = 'Erzähl mal: Wie bist du vorgegangen – und warum dachtest du, dass es so stimmt?';
    const history = [{ role: 'assistant' as const, content: q }, { role: 'user' as const, content: 'Ich dachte an Sauerstoff.' }];
    expect(isEcho('Wie bist du vorgegangen – und warum dachtest du, dass es so stimmt?', history)).toBe(true);
    expect(isEcho('Sauerstoff atmen wir, aber ist er auch das häufigste Gas? Was macht den Rest der Luft aus?', history)).toBe(false);
  });
});
