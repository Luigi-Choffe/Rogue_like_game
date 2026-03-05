
import { createInitialState, tickSimulation, generateId } from './engine';
import { GameState, Diet, Entity } from './types';
import { BASE_SPECIES } from './constants';

interface TestResult {
  name: string;
  pass: boolean;
  details: string;
}

async function runTest(name: string, setup: (state: GameState) => GameState, check: (state: GameState) => { pass: boolean, details: string }, ticks: number, seeds: number = 30): Promise<{ passRate: number, results: TestResult[] }> {
  let passes = 0;
  const results: TestResult[] = [];

  for (let i = 0; i < seeds; i++) {
    let state = setup(createInitialState());
    for (let t = 0; t < ticks; t++) {
      state = tickSimulation(state);
    }
    const res = check(state);
    if (res.pass) passes++;
    results.push({ name: `${name} Seed ${i}`, ...res });
  }

  return { passRate: passes / seeds, results };
}

export async function runAllTests() {
  console.log("Starting V3.3 Validation Tests...");
  const t1 = await runTest("T1 Rabbit Start", 
    (state) => {
      const rabbits: Entity[] = Array.from({ length: 10 }, () => ({
        id: generateId(), speciesId: 'rabbit', x: Math.floor(Math.random() * 24), y: Math.floor(Math.random() * 24),
        age: 0, energy: 100, health: 35, facing: { x: 0, y: 0 }, state: 'IDLE', mutation: 'NONE'
      }));
      return { ...state, entities: rabbits, status: 'SIMULATING' };
    },
    (state) => {
      const births = state.eraMetrics.birthsTotal || 0;
      const stuckCount = (state.eraMetrics as any).stuckCount || 0;
      const stuckRate = stuckCount / (state.entities.length * 120 || 1);
      return { pass: births <= 2 && stuckRate <= 0.03, details: `Births: ${births}, Stuck: ${(stuckRate * 100).toFixed(1)}%` };
    },
    120
  );

  const t2 = await runTest("T2 Bear Hunt",
    (state) => {
      const bears: Entity[] = Array.from({ length: 2 }, () => ({
        id: generateId(), speciesId: 'bear', x: Math.floor(Math.random() * 24), y: Math.floor(Math.random() * 24),
        age: 0, energy: 400, health: 200, facing: { x: 0, y: 0 }, state: 'IDLE', mutation: 'NONE'
      }));
      const rabbits: Entity[] = Array.from({ length: 40 }, () => ({
        id: generateId(), speciesId: 'rabbit', x: Math.floor(Math.random() * 24), y: Math.floor(Math.random() * 24),
        age: 0, energy: 100, health: 35, facing: { x: 0, y: 0 }, state: 'IDLE', mutation: 'NONE'
      }));
      return { ...state, entities: [...bears, ...rabbits], status: 'SIMULATING' };
    },
    (state) => {
      const kills = state.eraMetrics.kills.filter(k => k.predator === 'bear').length;
      const bearsAlive = state.entities.filter(e => e.speciesId === 'bear').length;
      const pass = kills >= 1 && bearsAlive >= 1;
      return { pass, details: `Kills: ${kills}, Bears Alive: ${bearsAlive}` };
    },
    600
  );

  const t3 = await runTest("T3 Scavenger Chain",
    (state) => {
      const vultures: Entity[] = Array.from({ length: 2 }, () => ({
        id: generateId(), speciesId: 'vulture', x: Math.floor(Math.random() * 24), y: Math.floor(Math.random() * 24),
        age: 0, energy: 100, health: 40, facing: { x: 0, y: 0 }, state: 'IDLE', mutation: 'NONE'
      }));
      const rabbits: Entity[] = Array.from({ length: 20 }, () => ({
        id: generateId(), speciesId: 'rabbit', x: Math.floor(Math.random() * 24), y: Math.floor(Math.random() * 24),
        age: 0, energy: 100, health: 35, facing: { x: 0, y: 0 }, state: 'IDLE', mutation: 'NONE'
      }));
      const wolf: Entity = {
        id: generateId(), speciesId: 'wolf', x: 12, y: 12,
        age: 0, energy: 150, health: 80, facing: { x: 0, y: 0 }, state: 'IDLE', mutation: 'NONE'
      };
      return { ...state, entities: [...vultures, ...rabbits, wolf], status: 'SIMULATING' };
    },
    (state) => {
      const carcassesConsumed = state.eraMetrics.carcassesConsumedEnergy > 0;
      return { pass: carcassesConsumed, details: `Consumed Energy: ${state.eraMetrics.carcassesConsumedEnergy.toFixed(1)}` };
    },
    1000
  );

  const t4 = await runTest("T4 Superpop Collapse",
    (state) => {
      const rabbits: Entity[] = Array.from({ length: 500 }, () => ({
        id: generateId(), speciesId: 'rabbit', x: Math.floor(Math.random() * 24), y: Math.floor(Math.random() * 24),
        age: 0, energy: 100, health: 35, facing: { x: 0, y: 0 }, state: 'IDLE', mutation: 'NONE'
      }));
      return { ...state, entities: rabbits, status: 'SIMULATING' };
    },
    (state) => {
      const finalPop = state.entities.length;
      const plantEnergy = state.grid.flat().reduce((acc, c) => acc + (c.plantEnergy || 0), 0);
      const pass = finalPop < 500 && plantEnergy < 5000;
      return { pass, details: `Pop: ${finalPop}, Plants: ${plantEnergy.toFixed(0)}` };
    },
    1000
  );

  return [
    { name: "T1 Rabbit Start", passRate: t1.passRate },
    { name: "T2 Bear Hunt", passRate: t2.passRate },
    { name: "T3 Scavenger Chain", passRate: t3.passRate },
    { name: "T4 Superpop Collapse", passRate: t4.passRate }
  ];
}
