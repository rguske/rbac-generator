import { describe, expect, it } from 'vitest';
import { RBAC_TEMPLATES } from './templates';

describe('RBAC_TEMPLATES', () => {
  it('has a unique id, name, and defaultName for every template', () => {
    const ids = new Set<string>();
    for (const template of RBAC_TEMPLATES) {
      expect(template.id).not.toBe('');
      expect(template.name).not.toBe('');
      expect(template.defaultName).not.toBe('');
      expect(ids.has(template.id)).toBe(false);
      ids.add(template.id);
    }
  });

  it('gives every rule non-empty verbs, and either resources or nonResourceURLs', () => {
    for (const template of RBAC_TEMPLATES) {
      expect(template.rules.length).toBeGreaterThan(0);
      for (const rule of template.rules) {
        expect(rule.verbs.length).toBeGreaterThan(0);
        if (rule.nonResourceURLs && rule.nonResourceURLs.length > 0) {
          expect(rule.apiGroups.length).toBe(0);
          expect(rule.resources.length).toBe(0);
        } else {
          expect(rule.apiGroups.length).toBeGreaterThan(0);
          expect(rule.resources.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('includes the six expected personas', () => {
    const names = RBAC_TEMPLATES.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Cluster-Admin',
        'Cluster-Viewer',
        'VirtualMachine-Admin',
        'VirtualMachine-Viewer',
        'Platform-Operator',
        'Network-Engineer',
      ]),
    );
  });

  it('gives Cluster-Viewer, VirtualMachine-Viewer, and Platform-Operator only read verbs', () => {
    const readOnly = ['get', 'list', 'watch'];
    for (const name of ['Cluster-Viewer', 'VirtualMachine-Viewer', 'Platform-Operator']) {
      const template = RBAC_TEMPLATES.find((t) => t.name === name)!;
      for (const rule of template.rules) {
        for (const verb of rule.verbs) {
          expect(readOnly).toContain(verb);
        }
      }
    }
  });

  it('gives VirtualMachine-Admin and VirtualMachine-Viewer read-only visibility into the core resources backing a VM', () => {
    for (const name of ['VirtualMachine-Admin', 'VirtualMachine-Viewer']) {
      const template = RBAC_TEMPLATES.find((t) => t.name === name)!;
      const coreRule = template.rules.find((r) => r.apiGroups.includes(''));
      expect(coreRule).toBeDefined();
      expect(coreRule!.resources).toEqual(
        expect.arrayContaining(['pods', 'persistentvolumeclaims', 'services', 'configmaps', 'events']),
      );
      expect(coreRule!.verbs).toEqual(['get', 'list', 'watch']);
    }
  });

  it('gives VirtualMachine-Admin and VirtualMachine-Viewer visibility into attached NetworkAttachmentDefinitions', () => {
    for (const name of ['VirtualMachine-Admin', 'VirtualMachine-Viewer']) {
      const template = RBAC_TEMPLATES.find((t) => t.name === name)!;
      const netRule = template.rules.find((r) => r.apiGroups.includes('k8s.cni.cncf.io'));
      expect(netRule).toBeDefined();
      expect(netRule!.resources).toEqual(['network-attachment-definitions']);
      expect(netRule!.verbs).toEqual(['get', 'list', 'watch']);
    }
  });

  it('gives VirtualMachine-Viewer read-only visibility into StorageClasses', () => {
    const template = RBAC_TEMPLATES.find((t) => t.name === 'VirtualMachine-Viewer')!;
    const storageRule = template.rules.find((r) => r.apiGroups.includes('storage.k8s.io'));
    expect(storageRule).toBeDefined();
    expect(storageRule!.resources).toEqual(['storageclasses']);
    expect(storageRule!.verbs).toEqual(['get', 'list', 'watch']);
  });

  it('gives Platform-Operator read-only visibility across core, workload, networking, OpenShift, and RBAC resources', () => {
    const template = RBAC_TEMPLATES.find((t) => t.name === 'Platform-Operator')!;
    const coreRule = template.rules.find((r) => r.apiGroups.includes(''));
    expect(coreRule!.resources).toEqual(expect.arrayContaining(['namespaces', 'nodes', 'pods', 'pods/log']));

    const rbacRule = template.rules.find((r) => r.apiGroups.includes('rbac.authorization.k8s.io'));
    expect(rbacRule).toBeDefined();
    expect(rbacRule!.resources).toEqual(
      expect.arrayContaining(['roles', 'rolebindings', 'clusterroles', 'clusterrolebindings']),
    );

    const noWriteVerbs = ['create', 'update', 'patch', 'delete'];
    for (const rule of template.rules) {
      for (const verb of noWriteVerbs) {
        expect(rule.verbs).not.toContain(verb);
      }
    }
  });

  it('gives Platform-Operator and Network-Engineer a nonResourceURLs rule for API discovery', () => {
    for (const name of ['Platform-Operator', 'Network-Engineer']) {
      const template = RBAC_TEMPLATES.find((t) => t.name === name)!;
      const discoveryRule = template.rules.find((r) => r.nonResourceURLs && r.nonResourceURLs.length > 0);
      expect(discoveryRule).toBeDefined();
      expect(discoveryRule!.nonResourceURLs).toEqual(expect.arrayContaining(['/healthz', '/version']));
      expect(discoveryRule!.verbs).toEqual(['get']);
    }
  });

  it('lets Network-Engineer manage NetworkPolicies, Routes, and secondary networks', () => {
    const template = RBAC_TEMPLATES.find((t) => t.name === 'Network-Engineer')!;
    const manageable: Array<[string, string]> = [
      ['networking.k8s.io', 'networkpolicies'],
      ['route.openshift.io', 'routes'],
      ['k8s.cni.cncf.io', 'network-attachment-definitions'],
      ['k8s.ovn.org', 'userdefinednetworks'],
    ];
    for (const [group, resource] of manageable) {
      const rule = template.rules.find((r) => r.apiGroups.includes(group) && r.resources.includes(resource));
      expect(rule).toBeDefined();
      expect(rule!.verbs).toEqual(expect.arrayContaining(['create', 'update', 'patch', 'delete']));
    }
  });

  it('keeps Network-Engineer read-only on cluster-wide networking config, NMState, and MetalLB', () => {
    const template = RBAC_TEMPLATES.find((t) => t.name === 'Network-Engineer')!;
    const viewOnlyGroups = ['nmstate.io', 'metallb.io', 'k8s.ovn.org'];
    for (const rule of template.rules) {
      if (viewOnlyGroups.some((g) => rule.apiGroups.includes(g)) && rule.resources.includes('clusteruserdefinednetworks')) {
        expect(rule.verbs).toEqual(['get', 'list', 'watch']);
      }
      if (rule.apiGroups.includes('nmstate.io') || rule.apiGroups.includes('metallb.io')) {
        expect(rule.verbs).toEqual(['get', 'list', 'watch']);
      }
    }
  });
});
