import type { Permission, RoleName } from './types';

/**
 * Role-based access control. Permissions are ENFORCED at the IPC boundary
 * (see src/main/ipc.ts), not merely hidden in the UI — every privileged main
 * handler calls `can()` before acting.
 */
export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  system_administrator: [
    'org.manage', 'client.manage', 'capture.run', 'capture.review', 'sop.manage',
    'workflow.approve', 'finding.resolve', 'recommendation.manage', 'training.deliver',
    'export.create', 'settings.manage', 'audit.read',
  ],
  savvytech_consultant: [
    'client.manage', 'capture.run', 'capture.review', 'sop.manage', 'workflow.approve',
    'finding.resolve', 'recommendation.manage', 'training.deliver', 'export.create', 'audit.read',
  ],
  client_administrator: [
    'capture.review', 'sop.manage', 'workflow.approve', 'finding.resolve',
    'recommendation.manage', 'training.deliver', 'export.create', 'audit.read',
  ],
  auditor: ['capture.run', 'capture.review', 'sop.manage', 'export.create', 'audit.read'],
  process_owner: ['capture.review', 'workflow.approve', 'finding.resolve', 'recommendation.manage', 'audit.read'],
  supervisor: ['capture.review', 'training.deliver', 'audit.read'],
  trainer: ['training.deliver', 'audit.read'],
  employee: [],
  read_only_reviewer: ['audit.read'],
};

export function permissionsFor(role: RoleName): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role] ?? []);
}

export function can(role: RoleName, permission: Permission): boolean {
  return permissionsFor(role).has(permission);
}
