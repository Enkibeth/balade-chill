/**
 * JSON Schemas handed to the providers' structured-output modes (Anthropic
 * output_config.format / OpenAI-compatible response_format) so the model
 * physically cannot return anything but the expected JSON shape. Kept within
 * the structured-outputs subset: no recursive schemas, no length/interval
 * constraints, additionalProperties: false on every object, nullability via
 * anyOf. Must stay in sync with the shapes in generated.ts and the prompts.
 */

type JsonSchema = Record<string, unknown>

const ENIGME_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    instruction: { type: 'string' },
    cipher_display: { type: 'string' },
    hint: { type: 'string' },
    answer: { type: 'string' },
    answer_explanation: { type: 'string' },
  },
  required: [
    'type',
    'title',
    'instruction',
    'cipher_display',
    'hint',
    'answer',
    'answer_explanation',
  ],
}

const BONUS_SCHEMA: JsonSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        category: { type: 'string' },
        label: { type: 'string' },
        specialty: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        question: { type: 'string' },
        hint: { type: 'string' },
        answer: { type: 'string' },
      },
      required: ['category', 'label', 'specialty', 'question', 'hint', 'answer'],
    },
    { type: 'null' },
  ],
}

const ETAPE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    order: { type: 'number' },
    location_name: { type: 'string' },
    lat: { type: 'number' },
    lng: { type: 'number' },
    story_text: { type: 'string' },
    direction_text: { type: 'string' },
    walk_minutes: { type: 'number' },
    action_mission: { type: 'string' },
    enigme: ENIGME_SCHEMA,
    medical_bonus: BONUS_SCHEMA,
  },
  required: [
    'order',
    'location_name',
    'lat',
    'lng',
    'story_text',
    'direction_text',
    'walk_minutes',
    'action_mission',
    'enigme',
    'medical_bonus',
  ],
}

/** Full balade draft — mirrors GeneratedBalade. */
export const BALADE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    theme_color: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        primary: { type: 'string' },
        secondary: { type: 'string' },
        accent: { type: 'string' },
        bg: { type: 'string' },
      },
      required: ['name', 'primary', 'secondary', 'accent', 'bg'],
    },
    estimated_duration_min: { type: 'number' },
    distance_km: { type: 'number' },
    story_context: { type: 'string' },
    prologue: { type: 'string' },
    epilogue: { type: 'string' },
    route_makes_sense: { type: 'boolean' },
    etapes: { type: 'array', items: ETAPE_SCHEMA },
  },
  required: [
    'title',
    'theme_color',
    'estimated_duration_min',
    'distance_km',
    'story_context',
    'prologue',
    'epilogue',
    'route_makes_sense',
    'etapes',
  ],
}

/** Single regenerated étape — mirrors the etape/regenerate FORMAT block. */
export const REGEN_ETAPE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    location_name: { type: 'string' },
    lat: { type: 'number' },
    lng: { type: 'number' },
    story_text: { type: 'string' },
    direction_text: { type: 'string' },
    action_mission: { type: 'string' },
    enigme: ENIGME_SCHEMA,
    medical_bonus: BONUS_SCHEMA,
  },
  required: [
    'location_name',
    'lat',
    'lng',
    'story_text',
    'direction_text',
    'action_mission',
    'enigme',
    'medical_bonus',
  ],
}

/** Orientation quiz — mirrors quiz.ts's expected FORMAT. */
export const QUIZ_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
              },
              required: ['id', 'label'],
            },
          },
        },
        required: ['id', 'label', 'options'],
      },
    },
  },
  required: ['questions'],
}
