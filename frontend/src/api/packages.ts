import { del, get, post, put, uploadFile } from "./client";
import type { ImportResponse, PackageDetail, PackageItem, PackageSummary } from "../types/package";

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

export function updatePackage(id: number, data: Record<string, unknown>) {
  return put<PackageSummary>(`/packages/${id}`, data);
}

export function publishPackage(id: number) {
  return post<PackageSummary>(`/packages/${id}/publish`);
}

export function unpublishPackage(id: number) {
  return post<PackageSummary>(`/packages/${id}/unpublish`);
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

export function updateItem(packageId: number, itemId: number, data: Record<string, unknown>) {
  return put<PackageItem>(`/packages/${packageId}/items/${itemId}`, data);
}

export function createItem(packageId: number, data: Record<string, unknown>) {
  return post<PackageItem>(`/packages/${packageId}/items`, data);
}

export function deleteItem(packageId: number, itemId: number) {
  return del(`/packages/${packageId}/items/${itemId}`);
}
