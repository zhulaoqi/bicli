export interface DataScopeRule {
  scopeType: "all" | "own" | "condition" | "deny";
  ownerField?: string;
  conditionField?: string;
  conditionOperator?: "eq" | "in" | "ne";
  conditionValue?: unknown;
}

export interface FieldScopeRule {
  fieldName: string;
  visibility: "visible" | "hidden" | "masked";
  maskPattern?: string;
}

export interface PermissionAdapter {
  resolveIdentity(credential: IdentityCredential): Promise<{ userId: number; role: string }>;
  getPermissions(role: string): Promise<string[]>;
  getDataScopeRules(role: string, resource: string): Promise<DataScopeRule[]>;
  getFieldScopeRules(role: string, resource: string): Promise<FieldScopeRule[]>;
}

export type IdentityCredential =
  | { type: "token"; token: string }
  | { type: "direct"; userId: number; role: string };
