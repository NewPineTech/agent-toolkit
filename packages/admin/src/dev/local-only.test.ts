import { describe, expect, it } from "vitest";
import {
  isLocalAdminHost,
  validateLocalAdminDevRuntime,
} from "./local-only.js";

describe("local admin dev guard", () => {
  it("allows only local hostnames in development mode", () => {
    expect(validateLocalAdminDevRuntime("development", "localhost")).toEqual({
      allowed: true,
    });
    expect(validateLocalAdminDevRuntime("development", "127.0.0.1")).toEqual({
      allowed: true,
    });
    expect(
      validateLocalAdminDevRuntime("development", "admin.localhost"),
    ).toEqual({
      allowed: true,
    });
    expect(
      validateLocalAdminDevRuntime("production", "localhost"),
    ).toMatchObject({
      allowed: false,
    });
    expect(
      validateLocalAdminDevRuntime("development", "example.com"),
    ).toMatchObject({
      allowed: false,
    });
  });

  it("does not treat public localhost-looking hostnames as local", () => {
    expect(isLocalAdminHost("localhost.example.com")).toBe(false);
    expect(isLocalAdminHost("127.0.0.1.example.com")).toBe(false);
  });
});
