import type { PolicyRule } from '../types/rbac';

export interface RbacTemplate {
  id: string;
  name: string;
  description: string;
  defaultName: string;
  rules: PolicyRule[];
}

/**
 * Pre-built persona RBAC rule sets offered on the Templates page. Selecting
 * one pre-fills the Create page (as either a ClusterRole or a namespaced
 * Role) so the user can still review, edit, dry-run, and Apply — nothing is
 * created directly from this list.
 */
export const RBAC_TEMPLATES: RbacTemplate[] = [
  {
    id: 'cluster-admin',
    name: 'Cluster-Admin',
    description: 'Full administrative access to every resource in the cluster (or namespace, as a Role).',
    defaultName: 'cluster-admin',
    rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
  },
  {
    id: 'cluster-viewer',
    name: 'Cluster-Viewer',
    description: 'Read-only access to every resource in the cluster (or namespace, as a Role).',
    defaultName: 'cluster-viewer',
    rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['get', 'list', 'watch'] }],
  },
  {
    id: 'vm-admin',
    name: 'VirtualMachine-Admin',
    description: 'Full lifecycle management of KubeVirt virtual machines: create, edit, delete, start/stop/restart, console/VNC access, and DataVolumes.',
    defaultName: 'vm-admin',
    rules: [
      {
        apiGroups: ['kubevirt.io'],
        resources: [
          'virtualmachines',
          'virtualmachineinstances',
          'virtualmachineinstancepresets',
          'virtualmachineinstancereplicasets',
          'virtualmachineinstancemigrations',
        ],
        verbs: ['*'],
      },
      {
        apiGroups: ['subresources.kubevirt.io'],
        resources: [
          'virtualmachines/start',
          'virtualmachines/stop',
          'virtualmachines/restart',
          'virtualmachines/migrate',
          'virtualmachineinstances/console',
          'virtualmachineinstances/vnc',
        ],
        verbs: ['*'],
      },
      {
        apiGroups: ['cdi.kubevirt.io'],
        resources: ['datavolumes', 'datasources'],
        verbs: ['*'],
      },
      {
        // The Pods/Services/etc. backing each VM, and their attached
        // NetworkAttachmentDefinitions, aren't covered by the KubeVirt API
        // groups above but are routinely needed to inspect a VM's state.
        apiGroups: [''],
        resources: ['pods', 'persistentvolumeclaims', 'services', 'configmaps', 'events'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        apiGroups: ['k8s.cni.cncf.io'],
        resources: ['network-attachment-definitions'],
        verbs: ['get', 'list', 'watch'],
      },
    ],
  },
  {
    id: 'vm-viewer',
    name: 'VirtualMachine-Viewer',
    description: 'Read-only visibility into KubeVirt virtual machines, their status, and DataVolumes. No console/VNC access.',
    defaultName: 'vm-viewer',
    rules: [
      {
        apiGroups: ['kubevirt.io'],
        resources: [
          'virtualmachines',
          'virtualmachineinstances',
          'virtualmachineinstancepresets',
          'virtualmachineinstancereplicasets',
          'virtualmachineinstancemigrations',
        ],
        verbs: ['get', 'list', 'watch'],
      },
      {
        apiGroups: ['cdi.kubevirt.io'],
        resources: ['datavolumes', 'datasources'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // Basic Kubernetes resources relevant to VMs.
        apiGroups: [''],
        resources: ['pods', 'persistentvolumeclaims', 'services', 'configmaps', 'events'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // Networks attached to VMs.
        apiGroups: ['k8s.cni.cncf.io'],
        resources: ['network-attachment-definitions'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        apiGroups: ['storage.k8s.io'],
        resources: ['storageclasses'],
        verbs: ['get', 'list', 'watch'],
      },
    ],
  },
  {
    id: 'platform-operator',
    name: 'Platform-Operator',
    description:
      'Broad read-only visibility across the platform: core resources, workloads, networking, OpenShift cluster operators, machine/compute infrastructure, storage, OLM, and RBAC. No create/update/patch/delete anywhere, so it cannot modify or remove anything — a troubleshooting/observability persona rather than an admin one.',
    defaultName: 'platform-operator',
    rules: [
      {
        // Core Kubernetes resources - broad visibility.
        apiGroups: [''],
        resources: [
          'namespaces',
          'nodes',
          'pods',
          'pods/status',
          'pods/log',
          'services',
          'endpoints',
          'persistentvolumeclaims',
          'persistentvolumes',
          'configmaps',
          'events',
          'resourcequotas',
          'limitranges',
          'serviceaccounts',
        ],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // Workloads - visibility only. No delete/update/patch/create: the
        // Platform Operator cannot accidentally modify or remove workloads.
        apiGroups: ['apps'],
        resources: ['deployments', 'replicasets', 'statefulsets', 'daemonsets', 'controllerrevisions'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        apiGroups: ['batch'],
        resources: ['jobs', 'cronjobs'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // Networking - visibility.
        apiGroups: ['networking.k8s.io'],
        resources: ['networkpolicies', 'ingresses', 'ingressclasses'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        apiGroups: ['route.openshift.io'],
        resources: ['routes'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // OpenShift Operators.
        apiGroups: ['config.openshift.io'],
        resources: [
          'clusteroperators',
          'clusterversions',
          'infrastructures',
          'networks',
          'dnses',
          'ingresses',
          'proxies',
          'authentications',
          'consoles',
          'projects',
          'schedulers',
        ],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // Machine / compute infrastructure - view only.
        apiGroups: ['machine.openshift.io'],
        resources: ['machines', 'machinesets', 'machinehealthchecks'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        apiGroups: ['machineconfiguration.openshift.io'],
        resources: ['machineconfigs', 'machineconfigpools', 'containerruntimeconfigs', 'kubeletconfigs'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // Storage.
        apiGroups: ['storage.k8s.io'],
        resources: ['storageclasses', 'csidrivers', 'csinodes', 'csistoragecapacities', 'volumeattachments'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // Operators / OLM - visibility only.
        apiGroups: ['operators.coreos.com'],
        resources: ['subscriptions', 'clusterserviceversions', 'installplans', 'operatorgroups', 'catalogsources'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // OpenShift API resources.
        apiGroups: ['operator.openshift.io'],
        resources: ['*'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // RBAC - visibility only. Important: no create/update/patch/delete
        // prevents privilege escalation through RoleBindings.
        apiGroups: ['rbac.authorization.k8s.io'],
        resources: ['roles', 'rolebindings', 'clusterroles', 'clusterrolebindings'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // CRDs - visibility.
        apiGroups: ['apiextensions.k8s.io'],
        resources: ['customresourcedefinitions'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // API discovery.
        apiGroups: [],
        resources: [],
        verbs: ['get'],
        nonResourceURLs: [
          '/api',
          '/api/*',
          '/apis',
          '/apis/*',
          '/healthz',
          '/healthz/*',
          '/readyz',
          '/readyz/*',
          '/version',
        ],
      },
    ],
  },
  {
    id: 'network-engineer',
    name: 'Network-Engineer',
    description:
      'Manage Kubernetes NetworkPolicies, OpenShift Routes, and secondary networks (Multus NADs, OVN-Kubernetes user-defined networks). Read-only visibility into cluster-wide networking config, MetalLB, and NMState host networking — deliberately view-only, since a bad change there can break node connectivity.',
    defaultName: 'network-engineer',
    rules: [
      {
        // Core network visibility.
        apiGroups: [''],
        resources: ['nodes', 'namespaces', 'pods', 'pods/status', 'services', 'endpoints', 'events'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // Kubernetes networking. NetworkPolicies can be managed.
        apiGroups: ['networking.k8s.io'],
        resources: ['networkpolicies'],
        verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
      },
      {
        apiGroups: ['networking.k8s.io'],
        resources: ['ingresses', 'ingressclasses'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // OpenShift Routes.
        apiGroups: ['route.openshift.io'],
        resources: ['routes'],
        verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
      },
      {
        // Multus secondary networks. NADs are namespaced resources.
        apiGroups: ['k8s.cni.cncf.io'],
        resources: ['network-attachment-definitions'],
        verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
      },
      {
        // User Defined Networks.
        apiGroups: ['k8s.ovn.org'],
        resources: ['userdefinednetworks'],
        verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
      },
      {
        // ClusterUserDefinedNetworks affect multiple namespaces. Read only.
        apiGroups: ['k8s.ovn.org'],
        resources: ['clusteruserdefinednetworks'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // AdminNetworkPolicy - cluster-scoped and potentially very
        // powerful. View only by default.
        apiGroups: ['policy.networking.k8s.io'],
        resources: ['adminnetworkpolicies', 'baselineadminnetworkpolicies'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // NMState / host networking. Important: view only. A bad NNCP can
        // break node connectivity.
        apiGroups: ['nmstate.io'],
        resources: ['nodenetworkconfigurationpolicies', 'nodenetworkconfigurationenactments', 'nodenetworkstates'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // OpenShift cluster networking configuration. View only.
        apiGroups: ['config.openshift.io'],
        resources: ['networks', 'infrastructures', 'ingresses', 'dnses', 'proxies'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // Cluster Network Operator configuration. View only.
        apiGroups: ['operator.openshift.io'],
        resources: ['networks', 'ingresses', 'dnses'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // MachineConfig visibility - useful for investigating NIC/bond/OVS
        // configuration, but absolutely no modification.
        apiGroups: ['machineconfiguration.openshift.io'],
        resources: ['machineconfigs', 'machineconfigpools'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // MetalLB.
        apiGroups: ['metallb.io'],
        resources: ['ipaddresspools', 'l2advertisements', 'bgpadvertisements', 'bgppeers', 'bfdprofiles', 'communities'],
        verbs: ['get', 'list', 'watch'],
      },
      {
        // Network diagnostics / API discovery.
        apiGroups: [],
        resources: [],
        verbs: ['get'],
        nonResourceURLs: ['/api', '/api/*', '/apis', '/apis/*', '/healthz', '/readyz', '/version'],
      },
    ],
  },
];
