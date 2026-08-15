import { invoke } from '@tauri-apps/api/core';
import type {
  CollectorStatus,
  HardwareInfo,
  NetProbe,
  NetworkDetail,
  PerfOverview,
  PerfPoint,
  SecuritySnapshot,
  SpeedEngine,
  SpeedTestRow,
  StartupApp,
  TimelineEvent,
} from '../types/security';
import type { SettingsTarget } from './suggest';
import {
  mockHardware,
  mockNetworkDetail,
  mockPerfOverview,
  mockPerfSeries,
  mockProbe,
  mockSnapshot,
  mockSpeedTests,
  mockStartupApps,
  mockTimeline,
} from './mock';

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

/** Saves a shareable health report; returns the path it was written to. */
export async function exportReport(content: string): Promise<string> {
  if (!isTauri) return '(browser preview — nothing written)';
  return invoke<string>('export_report', { content });
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

/** Null for the first ~2s after launch while the sampler warms up. */
export async function getPerfOverview(): Promise<PerfOverview | null> {
  if (!isTauri) return mockPerfOverview();
  return invoke<PerfOverview | null>('get_perf_overview');
}

export async function getPerfSeries(): Promise<PerfPoint[]> {
  if (!isTauri) return mockPerfSeries();
  return invoke<PerfPoint[]>('get_perf_series');
}

export async function getHardwareInfo(): Promise<HardwareInfo> {
  if (!isTauri) return mockHardware();
  return invoke<HardwareInfo>('get_hardware_info');
}

export async function getNetworkDetail(): Promise<NetworkDetail> {
  if (!isTauri) return mockNetworkDetail();
  return invoke<NetworkDetail>('get_network_detail');
}

export async function runNetProbe(): Promise<NetProbe> {
  if (!isTauri) {
    await new Promise((r) => setTimeout(r, 900));
    return mockProbe();
  }
  return invoke<NetProbe>('run_net_probe');
}

export async function runSpeedTest(engine: SpeedEngine): Promise<SpeedTestRow> {
  if (!isTauri) {
    await new Promise((r) => setTimeout(r, 3000));
    return { ...mockSpeedTests()[0], engine };
  }
  return invoke<SpeedTestRow>('run_speed_test', { engine });
}

export async function getSpeedTestHistory(): Promise<SpeedTestRow[]> {
  if (!isTauri) return mockSpeedTests();
  return invoke<SpeedTestRow[]>('get_speedtest_history');
}

export async function getStartupApps(): Promise<StartupApp[]> {
  if (!isTauri) return mockStartupApps();
  return invoke<StartupApp[]>('get_startup_apps');
}

export async function getDiagnostics(): Promise<CollectorStatus[]> {
  if (!isTauri) return [];
  return invoke<CollectorStatus[]>('get_diagnostics');
}

/**
 * Opens a Windows settings page. `target` is a closed union mirroring the
 * Rust enum — not a URL — so the WebView can only pick from a fixed menu.
 */
export async function openWindowsSetting(target: SettingsTarget): Promise<void> {
  if (!isTauri) {
    throw new Error('Opening Windows settings only works in the installed app.');
  }
  return invoke<void>('open_windows_setting', { target });
}
