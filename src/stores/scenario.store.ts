import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Scenario, OpsProfile, ForwardDriverCurve, AutomationConfig, TornadoParam } from '../schemas/scenario';
import { useEngineStore } from './engine.store';

interface ScenarioState {
  activeScenarioId: string | null;
  scenarios: Scenario[];
  opsProfile: OpsProfile | null;
  forwardDrivers: ForwardDriverCurve | null;
  automationConfig: AutomationConfig | null;
  tornadoParams: TornadoParam[];
  setOpsProfile: (p: OpsProfile) => void;
  setScenarios: (list: Scenario[]) => void;
  setActiveScenario: (id: string) => void;
  setForwardDrivers: (f: ForwardDriverCurve | null) => void;
  setAutomationConfig: (c: AutomationConfig | null) => void;
  setTornadoParams: (p: TornadoParam[]) => void;
  updateOpsProfile: (patch: Partial<OpsProfile>) => void;
}

function bumpEngineHash(): void {
  useEngineStore.getState().invalidate(Math.random().toString(36).slice(2));
}

export const useScenarioStore = create<ScenarioState>()(
  immer((set) => ({
    activeScenarioId: null,
    scenarios: [],
    opsProfile: null,
    forwardDrivers: null,
    automationConfig: null,
    tornadoParams: [],
    setOpsProfile: (p) => {
      set((s) => {
        s.opsProfile = p;
      });
      bumpEngineHash();
    },
    setScenarios: (list) =>
      set((s) => {
        s.scenarios = list;
        if (list.length && !s.activeScenarioId) {
          s.activeScenarioId = list.find((x) => x.isBaseline)?.id ?? list[0].id;
        }
      }),
    setActiveScenario: (id) => {
      set((s) => {
        s.activeScenarioId = id;
      });
      bumpEngineHash();
    },
    setForwardDrivers: (f) => {
      set((s) => {
        s.forwardDrivers = f;
      });
      bumpEngineHash();
    },
    setAutomationConfig: (c) => {
      set((s) => {
        s.automationConfig = c;
      });
      bumpEngineHash();
    },
    setTornadoParams: (p) =>
      set((s) => {
        s.tornadoParams = p;
      }),
    updateOpsProfile: (patch) => {
      set((s) => {
        if (s.opsProfile) Object.assign(s.opsProfile, patch);
      });
      bumpEngineHash();
    },
  }))
);
