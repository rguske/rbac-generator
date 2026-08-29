import { dump, load } from 'js-yaml';

export function toYaml<T>(value: T): string {
  return dump(value);
}

export function fromYaml<T>(text: string, expectedKind: string): T {
  const parsed = load(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('YAML must describe an object');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.kind && obj.kind !== expectedKind) {
    throw new Error(`Expected kind "${expectedKind}", got "${String(obj.kind)}"`);
  }
  return obj as T;
}
