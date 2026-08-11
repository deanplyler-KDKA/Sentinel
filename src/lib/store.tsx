import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import type {
  HardwareInfo, NetProbe, PerfOverview, PerfPoint, SecuritySnapshot, SpeedTestRow,
} from '../types/security';
import {
  getHardwareInfo, getPerfOverview, getPerfSeries, getSecuritySnapshot,
  getSpeedTestHistory, runNetProbe,
} from './api';
import { computeScore, type ScoreReport } from './score';
import {
  computeNetworkHealth, computeOverall, computePcHealth, explain,
  type Explanation, type HealthReport, type Overall,
} from './health';

const SNAPSHOT_INTERVAL_MS = 60_000;
const PERF_INTERVAL_MS = 3_000;
const PROBE_INTERVAL_MS = 5 * 60_000;

interface Store {
  snapshot: SecuritySnapshot | null;
  snapshotLoading: boolean;
  refreshSnapshot: () => void;
  perf: PerfOverview | null;
  series: PerfPoint[];
  hardware: HardwareInfo | null;
  probe: NetProbe | null;
  probeRunning: boolean;
  refreshProbe: () => void;
  speedHistory: SpeedTestRow[];
  refreshSpeedHistory: () => void;
  security: ScoreReport | null;
  pcHealth: HealthReport | null;
  netHealth: HealthReport | null;
  overall: Overall;
  explanations: Explanation[];
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SecuritySnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [perf, setPerf] = useState<PerfOverview | null>(null);
  const [series, setSeries] = useState<PerfPoint[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [probe, setProbe] = useState<NetProbe | null>(null);
  const [probeRunning, setProbeRunning] = useState(false);
  const [speedHistory, setSpeedHistory] = useState<SpeedTestRow[]>([]);
  const probeBusy = useRef(false);

  const refreshSnapshot = useCallback(() => {
    setSnapshotLoading(true);
    getSecuritySnapshot()
      .then(setSnapshot)
      .catch(() => {})
      .finally(() => setSnapshotLoading(false));
  }, []);

  const refreshProbe = useCallback(() => {
    if (probeBusy.current) return;
    probeBusy.current = true;
    setProbeRunning(true);
    runNetProbe()
      .then(setProbe)
      .catch(() => {})
      .finally(() => {
        probeBusy.current = false;
        setProbeRunning(false);
      });
  }, []);

  const refreshSpeedHistory = useCallback(() => {
    getSpeedTestHistory().then(setSpeedHistory).catch(() => {});
  }, []);

  useEffect(() => {
    refreshSnapshot();
    refreshSpeedHistory();
    refreshProbe();
    getHardwareInfo().then(setHardware).catch(() => {});
    const snapId = setInterval(refreshSnapshot, SNAPSHOT_INTERVAL_MS);
    const probeId = setInterval(refreshProbe, PROBE_INTERVAL_MS);
    // Tray → "Refresh status".
    let unlisten: (() => void) | null = null;
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/event').then(({ listen }) =>
        listen('tray-refresh', () => refreshSnapshot()).then((fn) => {
          unlisten = fn;
        }),
      );
    }
    return () => {
      clearInterval(snapId);
      clearInterval(probeId);
      unlisten?.();
    };
  }, [refreshSnapshot, refreshSpeedHistory, refreshProbe]);

  // Perf polling pauses while the window is hidden to keep idle cost low —
  // but the first fetch always runs so the UI never sits on empty data.
  useEffect(() => {
    const fetchPerf = () => {
      getPerfOverview().then(setPerf).catch(() => {});
      getPerfSeries().then(setSeries).catch(() => {});
    };
    fetchPerf();
    const id = setInterval(() => {
      if (!document.hidden) fetchPerf();
    }, PERF_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const security = useMemo(() => (snapshot ? computeScore(snapshot) : null), [snapshot]);
  const pcHealth = useMemo(
    () => (perf || hardware || snapshot ? computePcHealth(perf, hardware, snapshot) : null),
    [perf, hardware, snapshot],
  );
  const netHealth = useMemo(
    () => computeNetworkHealth(snapshot, probe, speedHistory),
    [snapshot, probe, speedHistory],
  );
  const overall = useMemo(
    () => computeOverall(security, pcHealth, netHealth, snapshot),
    [security, pcHealth, netHealth, snapshot],
  );
  const explanations = useMemo(
    () => explain(perf, probe, snapshot, security, speedHistory),
    [perf, probe, snapshot, security, speedHistory],
  );

  const value: Store = {
    snapshot, snapshotLoading, refreshSnapshot,
    perf, series, hardware,
    probe, probeRunning, refreshProbe,
    speedHistory, refreshSpeedHistory,
    security, pcHealth, netHealth, overall, explanations,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error('useStore outside StoreProvider');
  return store;
}
