import { invoke } from '@tauri-apps/api/core';
import type { SecuritySnapshot } from '../types/security';
import { mockSnapshot } from './mock';

/** True when running inside the Tauri shell (vs. a plain browser tab). */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function getSecuritySnapshot(): Promise<SecuritySnapshot> {
  if (!isTauri) {
    await new Promise((r) => setTimeout(r, 400));
    return mockSnapshot();
  }
  return invoke<SecuritySnapshot>('get_security_snapshot');
}
