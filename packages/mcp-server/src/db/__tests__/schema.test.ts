import { describe, it, expect } from "vitest";
import { users, roles, rolePermissions, forms, formFields, configs } from "../schema.js";

describe("schema definitions", () => {
  it("should export all 6 tables", () => {
    expect(users).toBeDefined();
    expect(roles).toBeDefined();
    expect(rolePermissions).toBeDefined();
    expect(forms).toBeDefined();
    expect(formFields).toBeDefined();
    expect(configs).toBeDefined();
  });
});
