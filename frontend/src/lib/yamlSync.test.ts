import { describe, expect, it } from 'vitest';
import { toYaml, fromYaml } from './yamlSync';

describe('yamlSync', () => {
  it('round-trips an object through YAML', () => {
    const value = { kind: 'Role', name: 'reader', rules: [{ apiGroups: [''], resources: ['pods'], verbs: ['get'] }] };
    const text = toYaml(value);
    const parsed = fromYaml<typeof value>(text, 'Role');
    expect(parsed).toEqual(value);
  });

  it('throws when the kind does not match', () => {
    const text = toYaml({ kind: 'ClusterRole', name: 'x' });
    expect(() => fromYaml(text, 'Role')).toThrow('Expected kind "Role", got "ClusterRole"');
  });

  it('throws on YAML that is not an object', () => {
    expect(() => fromYaml('- just\n- a\n- list', 'Role')).toThrow('YAML must describe an object');
  });

  it('allows a missing kind field', () => {
    const value = { name: 'reader' };
    const text = toYaml(value);
    expect(() => fromYaml(text, 'Role')).not.toThrow();
  });
});
