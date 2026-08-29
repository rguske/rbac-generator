export type Kind = 'roles' | 'clusterroles' | 'rolebindings' | 'clusterrolebindings';

export interface PolicyRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
  resourceNames?: string[];
}

export interface Subject {
  kind: 'ServiceAccount' | 'User' | 'Group';
  name: string;
  namespace?: string;
}

export interface RoleRef {
  kind: 'Role' | 'ClusterRole';
  name: string;
}

export interface RbacResource {
  name: string;
  namespace?: string;
  rules?: PolicyRule[];
  subjects?: Subject[];
  roleRef?: RoleRef;
}

export interface DiscoveryResource {
  group: string;
  version: string;
  resource: string;
  kind: string;
  namespaced: boolean;
  subResources?: string[];
  isCustomResource: boolean;
}

export interface DiscoveryResponse {
  source: 'live' | 'static';
  resources: DiscoveryResource[];
  verbs: string[];
}

export interface ClusterInfo {
  server: string;
  version: string;
  currentContext: string;
}

export interface SessionInfo {
  authenticated: boolean;
  connected: boolean;
  clusterInfo?: ClusterInfo;
}

export function isNamespaced(kind: Kind): boolean {
  return kind === 'roles' || kind === 'rolebindings';
}

export function requiresRules(kind: Kind): boolean {
  return kind === 'roles' || kind === 'clusterroles';
}

export function requiresSubjects(kind: Kind): boolean {
  return kind === 'rolebindings' || kind === 'clusterrolebindings';
}
