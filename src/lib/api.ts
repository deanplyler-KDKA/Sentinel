import { invoke } from '@tauri-apps/api/core';
import type { SecuritySnapshot, TimelineEvent } from '../types/security';
import { mockSnapshot, mockTimeline } from './mock';

/** True when running inside the Tauri shell (vs. a plain browser tab). */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface AppInfo {
  version: string;
  dataDir: string;
  logPath: string;
}

export async function getSecuritySnapshot(): Promise<SecuritySnapshot> {
  if (!isTauri) {
    await new Promise((r) => setTimeout(r, 400));
    return mockSnapshot();
  }
  return invoke<SecuritySnapshot>('get_security_snapshot');
}

export async function getAppInfo(): Promise<AppInfo> {
  if (!isTauri) {
    return { version: '0.1.0 (preview)', dataDir: '(browser preview)', logPath: '(browser preview)' };
  }
  return invoke<AppInfo>('get_app_info');
}

/** Returns the path the diagnostics bundle was written to. */
export async function exportDiagnostics(): Promise<string> {
  if (!isTauri) return '(browser preview — no diagnostics)';
  return invoke<string>('export_diagnostics');
}

/** Resets Sentinel's own stored data; returns the data directory. */
export async function resetAppData(): Promise<string> {
  if (!isTauri) return '(browser preview — nothing to reset)';
  return invoke<string>('reset_app_data');
}

/** Most recent security timeline events, newest first. */
export async function getTimeline(): Promise<TimelineEvent[]> {
  if (!isTauri) {
    await new Promise((r) => setTimeout(r, 250));
    return mockTimeline();
  }
  return invoke<TimelineEvent[]>('get_timeline');
}
