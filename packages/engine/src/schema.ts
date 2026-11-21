/**
 * Content schema v0.1 — the open, declarative format for Lumen courses.
 * Hierarchy: Path → Topic → Unit → Concept → Step.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = '0.1';

const Id = z
  .string()
  .min(2)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'IDs bestehen aus Kleinbuchstaben, Ziffern, Punkt, Binde- und Unterstrich');

export const FeedbackRuleSchema = z.object({
  when: z.string().min(1),
  misconception: z.string().optional(),
  text: z.string().min(1),
});

export const VariantSpecSchema = z.object({
  /** Parameter generators: "int[1,9]", "choice[2,3,5]", "step[0,2,0.5]". */
  params: z.record(z.string(), z.string()),
  /** Derived values as expressions over the params, e.g. c: "a + b". */
  derive: z.record(z.string(), z.string()).optional(),
  /** Every constraint must evaluate truthy; otherwise the sample is rejected. */
  constraints: z.array(z.string()).optional(),
  /** Values used for the lesson (seed 0). If omitted, seed 0 is sampled. */
  defaults: z.record(z.string(), z.number()).optional(),
});

export const VisualSchema = z.object({
  widget: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  interactive: z.boolean().default(false),
  alt: z.string().optional(),
});

export const ImageSchema = z.object({
  src: z.string(),
  alt: z.string().min(1, 'Bilder brauchen einen Alternativtext'),
  caption: z.string().optional(),
});

/** How deep a step goes: 1 = core idea, 2 = deeper, 3 = expert. Lessons climb, never descend. */
const Depth = z.number().int().min(1).max(3).optional();

export const ExplainStepSchema = z.object({
  kind: z.literal('explain'),
  id: Id.optional(),
  depth: Depth,
  title: z.string().optional(),
  body: z.string().min(1),
  visual: VisualSchema.optional(),
  image: ImageSchema.optional(),
  /** Active recall: the learner thinks first, then taps to reveal this text. */
  reveal: z.object({ label: z.string().optional(), body: z.string().min(1) }).optional(),
});

export const TutorConfigSchema = z.object({
  allow_reveal: z.boolean().default(false),
  tools: z.array(z.string()).default([]),
});

export const ProblemStepSchema = z.object({
  kind: z.literal('problem'),
  id: Id.optional(),
  depth: Depth,
  widget: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  prompt: z.string().min(1),
  body: z.string().optional(),
  /** Display-only widget shown above the interactive one. */
  visual: VisualSchema.optional(),
  check: z.object({ predicate: z.string().min(1) }).optional(),
  answer: z.unknown().optional(),
  solution: z
    .object({
      state: z.record(z.string(), z.unknown()).optional(),
      actions: z.array(z.unknown()).optional(),
    })
    .optional(),
  explanation: z.string().optional(),
  hints: z.array(z.string()).default([]),
  feedback: z.array(FeedbackRuleSchema).default([]),
  difficulty: z.number().int().min(1).max(3).default(1),
  unique: z.boolean().optional(),
  variants: VariantSpecSchema.optional(),
  tutor: TutorConfigSchema.optional(),
});

export const StepSchema = z.discriminatedUnion('kind', [ExplainStepSchema, ProblemStepSchema]);

export const ConceptSchema = z.object({
  id: Id,
  type: z.literal('concept'),
  title: z.string().min(1),
  summary: z.string().optional(),
  locale: z.string().default('de'),
  license: z.string(),
  authors: z.array(z.string()).min(1, 'Mindestens eine Autorin oder ein Autor'),
  sources: z.array(z.string()).optional(),
  skills: z.array(z.string()).default([]),
  estimated_minutes: z.number().positive().max(30),
  steps: z.array(StepSchema).min(1),
  srs: z.object({ cards_from: z.array(z.string()).min(1) }).optional(),
});

export const UnitSchema = z.object({
  id: Id,
  title: z.string().min(1),
  description: z.string().optional(),
  concepts: z.array(Id).min(1),
  review: z.boolean().default(true),
});

/** Subjects (Fächer). Each has one learning path that runs from zero to hero. */
export const SUBJECTS = ['math', 'physics', 'chemistry', 'biology', 'ee', 'cs', 'data', 'ai', 'logic'] as const;
export type Subject = (typeof SUBJECTS)[number];
/** Difficulty stages of a course, from zero to hero. */
export const LEVELS = ['Einstieg', 'Grundlagen', 'Aufbau', 'Fortgeschritten', 'Experte'] as const;
export type Level = (typeof LEVELS)[number];
export const levelIndex = (level: string): number => LEVELS.indexOf(level as Level);

export const TopicSchema = z.object({
  id: Id,
  type: z.literal('topic'),
  title: z.string().min(1),
  description: z.string().min(1),
  /** Stage on the subject's zero-to-hero path. */
  level: z.enum(LEVELS),
  /** Subject (Fach). */
  area: z.enum(SUBJECTS),
  locale: z.string().default('de'),
  license: z.string(),
  authors: z.array(z.string()).min(1),
  prerequisites: z.array(Id).default([]),
  /** Motif for the generated cover art (fraction, balance, puzzle, robot, ai, …). */
  icon: z.string().optional(),
  /** Topic colour (#rrggbb) used for covers, path nodes and banners. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  units: z.array(UnitSchema).min(1),
});

export const PathSchema = z.object({
  id: Id,
  type: z.literal('path'),
  title: z.string().min(1),
  description: z.string().min(1),
  level: z.string().optional(),
  /** The subject this path teaches; its topics run from Einstieg to Experte. */
  area: z.enum(SUBJECTS).optional(),
  locale: z.string().default('de'),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Courses in learning order – stages never go down, prerequisites come first. */
  topics: z.array(Id).min(1),
});

export const SkillSchema = z.object({
  id: Id,
  title: z.string(),
  prerequisites: z.array(Id).default([]),
});

export const SkillsFileSchema = z.object({
  type: z.literal('skills'),
  locale: z.string().default('de'),
  skills: z.array(SkillSchema),
});

export const PlacementItemSchema = z.object({
  /** If answered wrongly, learning should start here. */
  recommends: z.object({ topic: Id, unit: Id.optional() }),
  step: ProblemStepSchema,
});

export const PlacementSchema = z.object({
  type: z.literal('placement'),
  locale: z.string().default('de'),
  /** Recommendation when every item is answered correctly. */
  mastered: z.object({ topic: Id, unit: Id.optional() }),
  items: z.array(PlacementItemSchema).min(1).max(10),
});

export type FeedbackRule = z.infer<typeof FeedbackRuleSchema>;
export type VariantSpec = z.infer<typeof VariantSpecSchema>;
export type ExplainStep = z.infer<typeof ExplainStepSchema> & { id: string };
export type ProblemStep = z.infer<typeof ProblemStepSchema> & { id: string };
export type Step = ExplainStep | ProblemStep;
export type Concept = Omit<z.infer<typeof ConceptSchema>, 'steps'> & { steps: Step[] };
export type Unit = z.infer<typeof UnitSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Path = z.infer<typeof PathSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Placement = z.infer<typeof PlacementSchema>;
export type PlacementItem = z.infer<typeof PlacementItemSchema>;

export const ContentFileSchema = z.discriminatedUnion('type', [
  ConceptSchema,
  TopicSchema,
  PathSchema,
  SkillsFileSchema,
  PlacementSchema,
]);

/** JSON Schema for editor integration (YAML language server etc.). */
export function contentJsonSchema(): unknown {
  return z.toJSONSchema(ContentFileSchema, { unrepresentable: 'any' });
}
