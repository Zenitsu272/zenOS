import { apiRequest } from "./client";
import type { User } from "../types";

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
}

export interface AuthConfig {
  method: "email_otp" | "password";
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const config = await apiRequest<AuthConfig>("/auth/config", { auth: false });
  if (config?.method !== "email_otp" && config?.method !== "password") {
    throw new Error("Sign-in settings are unavailable. Please try again.");
  }
  return config;
}

export function requestEmailCode(email: string) {
  return apiRequest<{ message: string; expires_in: number; resend_after: number }>("/auth/request-code", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

export function verifyEmailCode(email: string, code: string) {
  return apiRequest<TokenResponse>("/auth/verify-code", {
    method: "POST",
    auth: false,
    body: { email, code },
  });
}

export function register(email: string, password: string) {
  return apiRequest<TokenResponse>("/register", {
    method: "POST",
    auth: false,
    body: { email, password }
  });
}

export function login(email: string, password: string) {
  return apiRequest<TokenResponse>("/login", {
    method: "POST",
    auth: false,
    body: { email, password }
  });
}

export function getMe() {
  return apiRequest<User>("/me");
}
