export interface ToolWithMeta {
  name: string;
  description?: string;
  inputSchema?: unknown;
  _meta?: {
    requiredPermissions?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function filterToolsByPermission(
  tools: ToolWithMeta[],
  userPermissions: string[]
): ToolWithMeta[] {
  return tools.filter(t => {
    const required = t._meta?.requiredPermissions as string[] | undefined;
    if (!required || required.length === 0) return true;
    return required.every((p: string) => userPermissions.includes(p));
  });
}
