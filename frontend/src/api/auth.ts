import { apiRequest } from "./client";
import type { User } from "../types";

interface TokenResponse {
  access_token: string;
  token_type: "bearer";
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
