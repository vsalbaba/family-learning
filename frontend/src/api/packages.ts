import { del, get, post, uploadFile } from "./client";
import type { ImportResponse, PackageDetail, PackageSummary } from "../types/package";

export function listPackages() {
  return get<PackageSummary[]>("/packages");
}

export function getPackage(id: number) {
  return get<PackageDetail>(`/packages/${id}`);
}

export function importPackageJson(content: string) {
  return post<ImportResponse>("/packages/import", { content });
}

export function importPackageFile(file: File) {
  return uploadFile<ImportResponse>("/packages/import/file", file);
}

export function publishPackage(id: number) {
  return post<PackageSummary>(`/packages/${id}/publish`);
}

export function archivePackage(id: number) {
  return post<PackageSummary>(`/packages/${id}/archive`);
}

export function deletePackage(id: number) {
  return del(`/packages/${id}`);
}

export function exportPackage(id: number) {
  return get<unknown>(`/packages/${id}/export`);
}
