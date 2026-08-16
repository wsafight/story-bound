import { createHash } from 'node:crypto'
import { defaultCustomStateSchema } from '@storybound/shared/schemas'
import Ajv, { type AnySchema, type ValidateFunction } from 'ajv'
import { AppError } from '../shared/errors'

const allowedKeywords = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'minimum',
  'maximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'title',
  'description',
])

const appManagedCustomKeys = new Set([
  'pinnedMemories',
  'chapterSummaries',
  'abilityUses',
  'stateSuggestions',
  'nodeProgress',
])
const validatorCache = new Map<string, ValidateFunction>()
const ajv = new Ajv({
  strict: true,
  allErrors: true,
  coerceTypes: false,
  removeAdditional: false,
  validateSchema: true,
})

function schemaHash(schema: unknown) {
  return createHash('sha256').update(JSON.stringify(schema)).digest('hex')
}

function assertPlainObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(422, 'STATE_SCHEMA_INVALID', `${path} 必须是对象 Schema`)
  }
}

function assertRestrictedSchema(schema: unknown, path = 'stateSchema') {
  assertPlainObject(schema, path)
  for (const key of Object.keys(schema)) {
    if (!allowedKeywords.has(key)) throw new AppError(422, 'STATE_SCHEMA_KEYWORD_UNSUPPORTED', `${path} 不支持 ${key}`)
  }
  if (
    schema.type !== 'object' &&
    schema.type !== 'array' &&
    schema.type !== 'string' &&
    schema.type !== 'number' &&
    schema.type !== 'integer' &&
    schema.type !== 'boolean' &&
    schema.type !== 'null'
  ) {
    throw new AppError(422, 'STATE_SCHEMA_TYPE_UNSUPPORTED', `${path}.type 不受支持`)
  }
  if (schema.type === 'object') {
    if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) {
      throw new AppError(422, 'STATE_SCHEMA_OBJECT_REQUIRED', `${path} 必须声明 properties`)
    }
    if (schema.additionalProperties !== false) {
      throw new AppError(422, 'STATE_SCHEMA_OPEN_OBJECT', `${path} 必须设置 additionalProperties: false`)
    }
    for (const [key, child] of Object.entries(schema.properties))
      assertRestrictedSchema(child, `${path}.properties.${key}`)
  }
  if (schema.type === 'array' && schema.items !== undefined) assertRestrictedSchema(schema.items, `${path}.items`)
}

export function compileCustomStateSchema(schema: unknown = defaultCustomStateSchema) {
  assertRestrictedSchema(schema)
  const hash = schemaHash(schema)
  const cached = validatorCache.get(hash)
  if (cached) return cached
  const validate = ajv.compile(schema as AnySchema)
  validatorCache.set(hash, validate)
  while (validatorCache.size > 200) validatorCache.delete(validatorCache.keys().next().value!)
  return validate
}

export function storyCustomState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([key]) => !appManagedCustomKeys.has(key)))
}

export function assertCustomStateMatchesSchema(schema: unknown, value: unknown, label: string) {
  const custom = storyCustomState(value)
  assertValueMatchesSchema(schema, custom, label)
  return custom
}

export function assertValueMatchesSchema(schema: unknown, value: unknown, label: string) {
  const validate = compileCustomStateSchema(schema)
  if (validate(value)) return value
  const message = validate.errors?.[0]?.instancePath || validate.errors?.[0]?.message || '格式不正确'
  throw new AppError(422, 'CUSTOM_STATE_INVALID', `${label}${message}`)
}
