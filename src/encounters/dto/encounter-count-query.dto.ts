import { z } from 'zod';

// Same options as front-demo: heavy 'include' keeps high-activity accounts,
// period 'current' drops pre-patch entities of monsters whose stats changed.
export const encounterCountQuerySchema = z.object({
  monster: z.string().regex(/^[a-z0-9_]{1,64}$/),
  heavy: z.enum(['include', 'exclude']).default('include'),
  period: z.enum(['current', 'all']).default('current'),
});

export type EncounterCountQueryDto = z.infer<typeof encounterCountQuerySchema>;
