import { get, post, put } from "./client";
import type { LoginResponse, User } from "../types/user";

export function getSetupStatus() {
  return get<{ parent_exists: boolean }>("/auth/setup-status");
}

export function setup(name: string, pin: string, appPin: string) {
  return post<User>("/auth/setup", { name, pin, app_pin: appPin });
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

export function updateChild(childId: number, data: { name?: string; pin?: string }) {
  return put<User>(`/children/${childId}`, data);
}

export interface PackageProgress {
  package_id: number;
  package_name: string;
  subject: string | null;
  session_count: number;
  avg_score_pct: number;
  best_score_pct: number;
  last_played: string | null;
}

export interface WeakQuestion {
  item_id: number;
  question: string;
  activity_type: string;
  correct_answer: string;
  package_name: string;
  wrong_count: number;
  total_attempts: number;
  error_rate_pct: number;
  wrong_answers: string[];
}

export interface ChildProgress {
  child_id: number;
  child_name: string;
  total_sessions: number;
  total_correct: number;
  total_questions: number;
  overall_avg_pct: number;
  packages: PackageProgress[];
  weak_questions: WeakQuestion[];
}

export function getChildProgress(childId: number) {
  return get<ChildProgress>(`/children/${childId}/progress`);
}
