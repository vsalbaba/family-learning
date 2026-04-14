import { get, post } from "./client";
import type { LoginResponse, User } from "../types/user";

export function setup(name: string, pin: string) {
  return post<User>("/auth/setup", { name, pin });
}

export function login(name: string, pin: string) {
  return post<LoginResponse>("/auth/login", { name, pin });
}

export function getMe() {
  return get<User>("/auth/me");
}

export function createChild(name: string, pin: string, avatar?: string) {
  return post<User>("/children", { name, pin, avatar });
}

export function listChildren() {
  return get<User[]>("/children");
}
