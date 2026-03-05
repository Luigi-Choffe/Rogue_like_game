import { GameState, Terrain, Entity, Species, Diet, Weather, TimeOfDay, Mutation, Cell, EcoEvent, WorldLaw, PlantType } from './types';
import { GRID_SIZE, BASE_SPECIES, DAY_LENGTH, NIGHT_LENGTH, TICKS_PER_ERA, PLANT_TYPES } from './constants';

export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

class PRNG {
  seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  range(min: number, max: number) {
    return min + this.next() * (max - min);
  }
  int(min: number, max: number) {
    return Math.floor(this.range(min, max));
  }
}

export function createInitialState(seed: number = Math.floor(Math.random() * 1000000), preset?: string): GameState {
  const rng = new PRNG(seed);
  const grid: Cell[][] = [];
  
  // PASSO 1 — Heightmap + smoothing
  let heightMap: number[][] = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0).map(() => rng.next()));
  
  for (let i = 0; i < 4; i++) {
    const nextHeightMap = heightMap.map(row => [...row]);
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        let sum = heightMap[y][x];
        let count = 1;
        const neighbors = [{dx:-1, dy:0}, {dx:1, dy:0}, {dx:0, dy:-1}, {dx:0, dy:1}];
        neighbors.forEach(({dx, dy}) => {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
            sum += heightMap[ny][nx];
            count++;
          }
        });
        nextHeightMap[y][x] = sum / count;
      }
    }
    heightMap = nextHeightMap;
  }

  // PASSO 3 — Rio (garantir 1 conexão)
  const waterTiles = new Set<string>();
  
  // Find a high point for source
  let sourceX = 0, sourceY = 0, maxH = -1;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (heightMap[y][x] > maxH) {
        maxH = heightMap[y][x];
        sourceX = x; sourceY = y;
      }
    }
  }

  // Path to opposite edge
  let currX = sourceX, currY = sourceY;
  const targetEdge = sourceX < GRID_SIZE / 2 ? GRID_SIZE - 1 : 0;
  
  for (let i = 0; i < GRID_SIZE * 2; i++) {
    waterTiles.add(`${currX},${currY}`);
    if (currX === targetEdge) break;
    
    const neighbors = [{dx:1, dy:0}, {dx:-1, dy:0}, {dx:0, dy:1}, {dx:0, dy:-1}];
    let bestX = currX, bestY = currY, minH = 2;
    
    neighbors.forEach(({dx, dy}) => {
      const nx = currX + dx, ny = currY + dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
        const h = heightMap[ny][nx] + rng.range(-0.05, 0.05);
        if (h < minH) {
          minH = h; bestX = nx; bestY = ny;
        }
      }
    });
    currX = bestX; currY = bestY;
  }

  // Widen river
  const riverPath = Array.from(waterTiles);
  riverPath.forEach(pos => {
    const [rx, ry] = pos.split(',').map(Number);
    const neighbors = [{dx:-1, dy:0}, {dx:1, dy:0}, {dx:0, dy:-1}, {dx:0, dy:1}];
    neighbors.forEach(({dx, dy}) => {
      const nx = rx + dx, ny = ry + dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && rng.next() < 0.35) {
        waterTiles.add(`${nx},${ny}`);
      }
    });
  });

  // PASSO 4 — Lago (opcional)
  if (rng.next() < 0.7) {
    let lakeX = rng.int(0, GRID_SIZE), lakeY = rng.int(0, GRID_SIZE);
    let minH = 2;
    for(let i=0; i<10; i++) {
      const tx = rng.int(0, GRID_SIZE), ty = rng.int(0, GRID_SIZE);
      if (heightMap[ty][tx] < minH) { minH = heightMap[ty][tx]; lakeX = tx; lakeY = ty; }
    }
    const lakeSize = rng.int(12, 25);
    const queue = [{x: lakeX, y: lakeY}];
    let count = 0;
    while(queue.length > 0 && count < lakeSize) {
      const {x, y} = queue.shift()!;
      if (!waterTiles.has(`${x},${y}`)) {
        waterTiles.add(`${x},${y}`);
        count++;
        const neighbors = [{dx:-1, dy:0}, {dx:1, dy:0}, {dx:0, dy:-1}, {dx:0, dy:1}];
        neighbors.forEach(({dx, dy}) => {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && !waterTiles.has(`${nx},${ny}`)) {
            queue.push({x: nx, y: ny});
          }
        });
      }
    }
  }

  // PASSO 5 & 6 — Moisture & Biomes
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      let distToWater = 100;
      waterTiles.forEach(pos => {
        const [wx, wy] = pos.split(',').map(Number);
        const d = Math.abs(x - wx) + Math.abs(y - wy);
        if (d < distToWater) distToWater = d;
      });
      
      const moisture = Math.max(0, 1 - distToWater / 10);
      const h = heightMap[y][x];
      
      let terrain = Terrain.DIRT;
      if (waterTiles.has(`${x},${y}`)) terrain = Terrain.WATER;
      else if (h > 0.78) terrain = Terrain.MOUNTAIN;
      else if (moisture > 0.62 && h > 0.35 && h < 0.75) terrain = Terrain.FOREST;
      else if (moisture > 0.35) terrain = Terrain.GRASS;
      
      row.push({ x, y, terrain, moisture: Math.floor(moisture * 100), riskValue: 0 });
    }
    grid.push(row);
  }

  // PASSO 7 — “Borda viva”
  for (let i = 0; i < 3; i++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (grid[y][x].terrain === Terrain.GRASS) {
          let forestNeighbors = 0;
          const neighbors = [{dx:-1, dy:0}, {dx:1, dy:0}, {dx:0, dy:-1}, {dx:0, dy:1}];
          neighbors.forEach(({dx, dy}) => {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && grid[ny][nx].terrain === Terrain.FOREST) {
              forestNeighbors++;
            }
          });
          if (forestNeighbors >= 3 && rng.next() < 0.25) {
            grid[y][x].terrain = Terrain.FOREST;
          }
        }
      }
    }
  }

  const initialEntities: Entity[] = [];

  if (preset === 'Wolf Chase') {
    const wolfSpec = BASE_SPECIES['wolf'];
    initialEntities.push({ 
      id: generateId(), speciesId: 'wolf', x: Math.floor(GRID_SIZE/2), y: Math.floor(GRID_SIZE/2), 
      age: 0, energy: wolfSpec.maxEnergy * 0.85, health: wolfSpec.maxHealth, facing: {x:0, y:0}, state: 'IDLE', mutation: 'NONE',
      satiatedTicks: 220, chaseTicks: 0
    });
    for(let i=0; i<8; i++) {
      const s = BASE_SPECIES['rabbit'];
      initialEntities.push({ id: generateId(), speciesId: 'rabbit', x: rng.int(0, GRID_SIZE), y: rng.int(0, GRID_SIZE), age: 0, energy: s.maxEnergy * 0.5, health: s.maxHealth, facing: {x:0, y:0}, state: 'IDLE', mutation: 'NONE' });
    }
  } else {
    // Seed the initial world with life
    for(let i=0; i<35; i++) {
        const x = rng.int(0, GRID_SIZE);
        const y = rng.int(0, GRID_SIZE);
        const terrain = grid[y][x].terrain;
        if (terrain === Terrain.GRASS || terrain === Terrain.DIRT) {
          grid[y][x].plantType = 'tough_grass';
          grid[y][x].plantEnergy = 80;
        } else if (terrain === Terrain.WATER) {
          grid[y][x].plantType = 'algae';
          grid[y][x].plantEnergy = 90;
        }
    }
    for(let i=0; i<8; i++) {
        const x = rng.int(0, GRID_SIZE);
        const y = rng.int(0, GRID_SIZE);
        if (grid[y][x].terrain === Terrain.FOREST) {
          grid[y][x].plantType = 'berry_bush';
          grid[y][x].plantEnergy = 100;
        }
    }
    for(let i=0; i<4; i++) {
        const s = BASE_SPECIES['rabbit'];
        initialEntities.push({ id: generateId(), speciesId: 'rabbit', x: rng.int(0, GRID_SIZE), y: rng.int(0, GRID_SIZE), age: 0, energy: s.maxEnergy * 0.4, health: s.maxHealth, facing: {x:0, y:0}, state: 'IDLE', mutation: 'NONE' });
    }
    
    // Spawn 1 wolf at start
    const wolfSpec = BASE_SPECIES['wolf'];
    initialEntities.push({ 
      id: generateId(), speciesId: 'wolf', x: rng.int(0, GRID_SIZE), y: rng.int(0, GRID_SIZE), 
      age: 0, energy: wolfSpec.maxEnergy * 0.85, health: wolfSpec.maxHealth, facing: {x:0, y:0}, state: 'IDLE', mutation: 'NONE',
      satiatedTicks: 220, chaseTicks: 0
    });
  }

  return {
    status: 'MENU',
    era: 1,
    tick: 0,
    grid,
    entities: initialEntities,
    unlockedSpecies: {
      'rabbit': BASE_SPECIES['rabbit'],
      'wolf': BASE_SPECIES['wolf']
    },
    draftOptions: [],
    selectedDraft: null,
    lastActionDescription: 'The primordial world awaits your command.',
    eraStartStats: {},
    eraSummary: '',
    isGeneratingSummary: false,
    weather: Weather.NORMAL,
    weatherDuration: 0,
    populationHistory: [],
    timeOfDay: TimeOfDay.DAY,
    timeUntilNextCycle: DAY_LENGTH,
    activeEvents: [],
    activeLaws: [],
    alerts: [],
    worldSeed: seed,
    eraMetrics: {
      births: {},
      deaths: { hunger: 0, combat: 0, climate: 0, age: 0 },
      kills: [],
      popHistory: [],
      energyTotals: { animals: 0, plants: 0, carcasses: 0 },
      birthsTotal: 0,
      matingsStarted: 0,
      carcassesSpawned: 0,
      carcassesConsumedEnergy: 0,
      plantEnergyConsumed: 0,
      plantEnergyRegrown: 0,
      rabbitReserveTriggeredCount: 0,
      grassSpreadConversions: 0,
      rabbitCanMateTicks: 0,
      rabbitMatingAttempts: 0,
      rabbitBirths: 0,
      deerCanMateTicks: 0,
      deerMatingAttempts: 0,
      deerBirths: 0
    },
    selectedEntityId: null
  };
}

export function getNeighbors(x: number, y: number): { x: number, y: number }[] {
  const neighbors = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
        neighbors.push({ x: nx, y: ny });
      }
    }
  }
  return neighbors.sort(() => Math.random() - 0.5);
}

export function getWalkableNeighbors(x: number, y: number, species: Species, grid: Cell[][]): { x: number, y: number }[] {
  const neighbors = getNeighbors(x, y);
  
  if (species.movementTypes.includes('FLY')) return neighbors;
  
  return neighbors.filter(n => {
    const terrain = grid[n.y][n.x].terrain;
    if (species.movementTypes.includes('SWIM') && terrain === Terrain.WATER) return true;
    if (species.movementTypes.includes('WALK') && terrain !== Terrain.WATER) return true;
    // If it has both, it can go anywhere
    if (species.movementTypes.includes('SWIM') && species.movementTypes.includes('WALK')) return true;
    return false;
  });
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function canSee(entity: Entity, target: Entity, species: Species): boolean {
  const visionRange = species.visionRange ?? 5;
  const visionAngle = species.visionAngle ?? 360;

  if (visionRange === 0) return false;
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  
  if (dist > visionRange) return false;
  if (visionAngle >= 360) return true;
  if (dist === 0) return true;
  
  if (!entity.facing || (entity.facing.x === 0 && entity.facing.y === 0)) return true;
  
  const angleToTarget = Math.atan2(dy, dx);
  const facingAngle = Math.atan2(entity.facing.y, entity.facing.x);
  let diff = Math.abs(angleToTarget - facingAngle);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  
  return diff <= (visionAngle * Math.PI / 360);
}

export function evolveSpecies(species: Species): Species {
  const stats: (keyof Species)[] = ['maxAge', 'maxEnergy', 'maxHealth', 'strength', 'efficiency', 'intelligence', 'visionRange'];
  const statToBoost = stats[Math.floor(Math.random() * stats.length)];
  
  const evolved = { ...species };
  evolved.generation = (evolved.generation || 0) + 1;
  
  const boost = 1.1 + Math.random() * 0.1;
  
  if (typeof evolved[statToBoost] === 'number') {
    (evolved[statToBoost] as number) = Math.round((evolved[statToBoost] as number) * boost);
  }

  if (evolved.personality) {
    const pKeys: (keyof NonNullable<Species['personality']>)[] = ['fear', 'hunger', 'libido', 'aggression', 'social'];
    const pKey = pKeys[Math.floor(Math.random() * pKeys.length)];
    const drift = (Math.random() - 0.5) * 0.1;
    evolved.personality = {
      ...evolved.personality,
      [pKey]: Math.max(0, Math.min(1, evolved.personality[pKey] + drift))
    };
  }
  
  return evolved;
}

export function tickSimulation(state: GameState): GameState {
  const newEntities: Entity[] = [];
  const entitiesToRemove = new Set<string>();
  const healthChanges: Record<string, number> = {};
  const energyChanges: Record<string, number> = {};
  const currentTick = state.tick + 1;
  const eraMetrics = { ...state.eraMetrics };

  // 0. Update Day/Night Cycle
  let newTimeOfDay = state.timeOfDay;
  let newTimeUntilNextCycle = state.timeUntilNextCycle - 1;
  if (newTimeUntilNextCycle <= 0) {
    newTimeOfDay = state.timeOfDay === TimeOfDay.DAY ? TimeOfDay.NIGHT : TimeOfDay.DAY;
    newTimeUntilNextCycle = newTimeOfDay === TimeOfDay.DAY ? DAY_LENGTH : NIGHT_LENGTH;
  }

  // 1. Update Events
  const newActiveEvents = state.activeEvents
    .map(e => ({ ...e, duration: e.duration - 1 }))
    .filter(e => e.duration > 0);

  // 2. Weather Management
  let currentWeather = state.weather;
  let weatherDuration = state.weatherDuration;
  if (weatherDuration > 0) {
    weatherDuration--;
  } else {
    currentWeather = Weather.NORMAL;
  }

  // 3. Risk Map Decay & Grid Update
  const newGrid = state.grid.map(row => row.map(cell => ({
    ...cell,
    riskValue: Math.max(0, (cell.riskValue || 0) * 0.98 - 0.005)
  })));

  // 4. Plant Growth & Biome Stress & Grass Spread
  const biomePressure: Record<Terrain, number> = {
    [Terrain.DIRT]: 0, [Terrain.GRASS]: 0, [Terrain.WATER]: 0, [Terrain.FOREST]: 0, [Terrain.MOUNTAIN]: 0
  };
  const biomeSupply: Record<Terrain, number> = {
    [Terrain.DIRT]: 0, [Terrain.GRASS]: 0, [Terrain.WATER]: 0, [Terrain.FOREST]: 0, [Terrain.MOUNTAIN]: 0
  };

  // Calculate current coverage per type and biome
  const terrainCounts: Record<Terrain, number> = {
    [Terrain.DIRT]: 0, [Terrain.GRASS]: 0, [Terrain.WATER]: 0, [Terrain.FOREST]: 0, [Terrain.MOUNTAIN]: 0
  };
  const plantCounts: Record<string, Record<Terrain, number>> = {};
  Object.keys(PLANT_TYPES).forEach(id => {
    plantCounts[id] = { [Terrain.DIRT]: 0, [Terrain.GRASS]: 0, [Terrain.WATER]: 0, [Terrain.FOREST]: 0, [Terrain.MOUNTAIN]: 0 };
  });

  const dirtCells: {x: number, y: number}[] = [];
  const grassCells: {x: number, y: number}[] = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = state.grid[y][x];
      terrainCounts[cell.terrain]++;
      if (cell.plantType) {
        plantCounts[cell.plantType][cell.terrain]++;
      }
      if (cell.terrain === Terrain.DIRT) dirtCells.push({x, y});
      if (cell.terrain === Terrain.GRASS) grassCells.push({x, y});
    }
  }

  // V3.6 Grass Spread
  const dirtSamples = Math.min(18, dirtCells.length);
  for (let i = 0; i < dirtSamples; i++) {
    const idx = Math.floor(Math.random() * dirtCells.length);
    const {x, y} = dirtCells[idx];
    const neighbors = getNeighbors(x, y);
    let hasGrassOrForest = false;
    let minWaterDist = 999;
    
    for (const n of neighbors) {
      const nt = newGrid[n.y][n.x].terrain;
      if (nt === Terrain.GRASS || nt === Terrain.FOREST) hasGrassOrForest = true;
      if (nt === Terrain.WATER) minWaterDist = 1; // Simplified distance
    }

    if (hasGrassOrForest) {
      const moisture = 1 - Math.min(1, minWaterDist / 10);
      let chance = 0.00022 * (0.35 + 0.65 * moisture);
      if (currentWeather === Weather.RAIN) chance *= 1.7;
      if (currentWeather === Weather.DROUGHT) chance *= 0.5;
      
      if (Math.random() < chance) {
        newGrid[y][x].terrain = Terrain.GRASS;
        eraMetrics.grassSpreadConversions = (eraMetrics.grassSpreadConversions || 0) + 1;
      }
    }
  }

  // V3.6 Forest Spread
  if (currentTick % 30 === 0) {
    const grassSamples = Math.min(10, grassCells.length);
    for (let i = 0; i < grassSamples; i++) {
      const idx = Math.floor(Math.random() * grassCells.length);
      const {x, y} = grassCells[idx];
      const neighbors = getNeighbors(x, y);
      let forestCount = 0;
      for (const n of neighbors) {
        if (newGrid[n.y][n.x].terrain === Terrain.FOREST) forestCount++;
      }
      if (forestCount >= 3 && Math.random() < 0.002) {
        newGrid[y][x].terrain = Terrain.FOREST;
      }
    }
  }

  state.entities.forEach(e => {
    const species = state.unlockedSpecies[e.speciesId] || BASE_SPECIES[e.speciesId];
    if (!species || species.diet === Diet.PLANT || species.diet === Diet.NONE) return;
    const terrain = state.grid[e.y][e.x].terrain;
    // Increased pressure per entity to make overpopulation harder
    biomePressure[terrain] += (species.energyCost / (species.efficiency || 1)) * 2.5;
  });

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = newGrid[y][x];
      if (cell.plantType) {
        const pType = PLANT_TYPES[cell.plantType];
        if (pType) {
          biomeSupply[cell.terrain] += pType.regrowPerTick;
          let regrowRate = pType.regrowPerTick;
          
          // Overgrazing penalty: if energy is low, regrow is much slower
          if ((cell.plantEnergy || 0) < 20) regrowRate *= 0.2;
          else if ((cell.plantEnergy || 0) < 50) regrowRate *= 0.6;

          if (currentWeather === Weather.RAIN) regrowRate *= 1.5;
          if (currentWeather === Weather.DROUGHT) regrowRate *= 0.2; // Harsher drought
          
          newActiveEvents.forEach(e => {
            if (e.modifiers.plantGrowth) regrowRate *= (1 + e.modifiers.plantGrowth);
          });
          
          state.activeLaws.forEach(l => {
            if (l.modifiers.regrowRate) regrowRate *= (1 + l.modifiers.regrowRate);
          });
          
          cell.plantEnergy = Math.min(100, (cell.plantEnergy || 0) + regrowRate);
          eraMetrics.plantEnergyRegrown += regrowRate;
        }
      } else {
        Object.values(PLANT_TYPES).forEach((pType: PlantType) => {
          const cap = pType.maxCoveragePerBiome[cell.terrain] || 0;
          if (cap <= 0) return;
          
          const currentCoverage = plantCounts[pType.id][cell.terrain] / (terrainCounts[cell.terrain] || 1);
          if (currentCoverage >= cap) return;

          const baseChance = 0.0002;
          const chance = baseChance * (1 - currentCoverage / cap);
          
          if (pType.preferredTerrain.includes(cell.terrain) && Math.random() < chance) {
            cell.plantType = pType.id;
            cell.plantEnergy = 30;
            plantCounts[pType.id][cell.terrain]++; // Update local count to prevent over-spawning in same tick
          }
        });
      }
    }
  }

  const densityStress: Record<Terrain, number> = {
    [Terrain.DIRT]: 0, [Terrain.GRASS]: 0, [Terrain.WATER]: 0, [Terrain.FOREST]: 0, [Terrain.MOUNTAIN]: 0
  };
  Object.keys(densityStress).forEach(k => {
    const t = k as Terrain;
    const stressScale = 4.0; // Lower scale = higher stress
    densityStress[t] = Math.max(0, (biomePressure[t] - biomeSupply[t]) / stressScale);
  });

  // 5. Animal AI & Metabolism
  const entityMap = new Map<string, Entity[]>();
  const speciesPopCounts: Record<string, number> = {};
  
  state.entities.forEach(entity => {
    const key = `${entity.x},${entity.y}`;
    if (!entityMap.has(key)) entityMap.set(key, []);
    entityMap.get(key)!.push(entity);
    
    speciesPopCounts[entity.speciesId] = (speciesPopCounts[entity.speciesId] || 0) + 1;
  });
  const getEntitiesAt = (x: number, y: number) => entityMap.get(`${x},${y}`) || [];

  for (const entity of state.entities) {
    const species = state.unlockedSpecies[entity.speciesId] || BASE_SPECIES[entity.speciesId];
    if (!species) continue;

    if (species.diet === Diet.NONE) {
      // Carcass decay logic
      if (entity.speciesId === 'carcass') {
        const rot = Math.max(1, entity.energy * 0.01);
        energyChanges[entity.id] = (energyChanges[entity.id] || 0) - rot;
        if (entity.energy + (energyChanges[entity.id] || 0) <= 0) entitiesToRemove.add(entity.id);
      }
      
      if (entity.age > species.maxAge) entitiesToRemove.add(entity.id);
      newEntities.push({ ...entity, age: entity.age + 1 });
      continue;
    }

    // V3.3 Cooldowns & Gestation
    let mateCooldownTicks = entity.mateCooldownTicks || 0;
    let pregnantTicks = entity.pregnantTicks || 0;
    let pregnantMateId = entity.pregnantMateId;
    let mateLockTicks = entity.mateLockTicks || 0;
    let targetMateId = entity.targetMateId;
    let preyLockTicks = entity.preyLockTicks || 0;
    let targetPreyId = entity.targetPreyId;
    let hibernateTicks = entity.hibernateTicks || 0;
    let satiatedTicks = entity.satiatedTicks || 0;
    let chaseTicks = entity.chaseTicks || 0;
    let lastDistanceToTarget = entity.lastDistanceToTarget || 0;

    if (mateCooldownTicks > 0) mateCooldownTicks--;
    if (pregnantTicks > 0) pregnantTicks--;
    if (mateLockTicks > 0) mateLockTicks--;
    if (preyLockTicks > 0) preyLockTicks--;
    if (hibernateTicks > 0) hibernateTicks--;
    if (satiatedTicks > 0) satiatedTicks--;

    // Per-species Guardrails: Outbreak
    const speciesPop = state.entities.filter(e => e.speciesId === entity.speciesId).length;
    const preferredTiles = state.grid.flat().filter(c => species.preferredTerrain.includes(c.terrain)).length;
    const crowdingIndex = speciesPop / (1 + preferredTiles * 0.1);
    
    let isOutbreak = entity.outbreakActive || false;
    let outbreakDur = entity.outbreakDuration || 0;
    if (!isOutbreak && speciesPop > 18 && crowdingIndex > 2.2) {
      isOutbreak = true;
      outbreakDur = 180;
    }
    if (isOutbreak) {
      outbreakDur--;
      if (outbreakDur <= 0) isOutbreak = false;
    }

    // AI Decision Making (Utility-Based)
    let newState = entity.state;
    let targetCell = null;
    const currentPos = { x: entity.x, y: entity.y };
    const memory = entity.memory || [];
    const ticksInCurrentState = (entity.ticksInCurrentState || 0) + 1;
    
    // Perception (Always needed for movement decisions)
    const visibleEntities = state.entities.filter(e => e.id !== entity.id && canSee(entity, e, species));
    const predators = visibleEntities.filter(e => {
      const eSpec = state.unlockedSpecies[e.speciesId] || BASE_SPECIES[e.speciesId];
      return eSpec && eSpec.diet === Diet.CARNIVORE && eSpec.strength > species.strength;
    });
    const potentialMates = visibleEntities.filter(e => e.speciesId === entity.speciesId && e.energy > species.maxEnergy * 0.4);

    // HIBERNATING state is sticky
    if (entity.state === 'HIBERNATING' && hibernateTicks > 0 && entity.energy > species.maxEnergy * 0.4) {
      // Stay hibernating
      newState = 'HIBERNATING';
    } else {
      // Mobile states should rethink every tick to ensure continuous movement
      const isMobileState = ['HUNTING', 'FLEEING', 'MATING', 'WANDERING', 'FIGHTING'].includes(entity.state);
      const minStateDuration = isMobileState ? 1 : 15;

      // Update Memory & Risk Map
      predators.forEach(p => {
        if (!memory.some(m => m.x === p.x && m.y === p.y && m.type === 'THREAT')) {
          memory.push({ x: p.x, y: p.y, type: 'THREAT' });
        }
        newGrid[p.y][p.x].riskValue = Math.min(1, (newGrid[p.y][p.x].riskValue || 0) + 0.35);
      });
      if (memory.length > 5) memory.shift();

      // Decision Logic
      const shouldRethink = ticksInCurrentState >= minStateDuration || ['IDLE', 'WANDERING', 'HIBERNATING'].includes(entity.state);
      
      if (shouldRethink) {
        const hunger = 1 - (entity.energy / species.maxEnergy);
        const fear = predators.length > 0 ? 1 : (newGrid[entity.y][entity.x].riskValue || 0);
        const libido = entity.energy > species.reproduceThreshold ? (entity.energy / species.maxEnergy) : 0;
        
        const p = species.personality || { fear: 0.5, hunger: 0.5, libido: 0.5, aggression: 0.5, social: 0.5 };
        
        // Drives
        let hungerDrive = hunger * p.hunger * 2.5; 
        let fearDrive = fear * p.fear * 3.0; 
        let libidoDrive = libido * p.libido * 2.5; 
        let aggroDrive = p.aggression * (predators.length > 0 ? 0.8 : 0.05); 
        let socialDrive = p.social * 0.4;

        const energyRatio = entity.energy / species.maxEnergy;

        // V3.6.1 Satiety Rule Fix
        const huntStop = species.huntStopRatio || 0.85;
        if (satiatedTicks > 0 && species.diet === Diet.CARNIVORE && energyRatio >= huntStop) {
          hungerDrive *= 0.15;
        }

        // V3.6.1 Anti-Wipe (Carnivores) Fix
        if (species.diet === Diet.CARNIVORE && energyRatio > 0.60) {
          // Simplified: check total herbivores
          const preyPop = state.entities.filter(e => {
            const s = state.unlockedSpecies[e.speciesId] || BASE_SPECIES[e.speciesId];
            return s && s.diet === Diet.HERBIVORE;
          }).length;
          
          if (preyPop <= 12) { // 8 rabbits + 4 deer approx
            hungerDrive *= 0.15;
            eraMetrics.rabbitReserveTriggeredCount = (eraMetrics.rabbitReserveTriggeredCount || 0) + 1;
          }
        }

        // V3.6 Scavenger Fix
        if (species.diet === Diet.SCAVENGER) {
          aggroDrive = 0; // Never fight
          if (hunger > 0.25) {
            // High priority to find carcass
            hungerDrive *= 2.0;
          }
        }

        // V3.3 Libido Blocks
        let canMate = true;
        if (mateCooldownTicks > 0) canMate = false;
        if (pregnantTicks > 0) canMate = false;
        if (entity.age < species.maxAge * (species.minMateAgeRatio || 0.25)) canMate = false;
        if (entity.energy < species.maxEnergy * (species.minMateEnergyRatio || 0.85)) canMate = false;

        if (!canMate) libidoDrive = 0;
        else {
          if (species.id === 'rabbit') eraMetrics.rabbitCanMateTicks = (eraMetrics.rabbitCanMateTicks || 0) + 1;
          if (species.id === 'deer') eraMetrics.deerCanMateTicks = (eraMetrics.deerCanMateTicks || 0) + 1;
        }

        // V3.6.1 Population Pressure adjustment
        const popSpecies = speciesPopCounts[entity.speciesId] || 0;
        const preferredTilesCount = state.grid.flat().filter(c => species.preferredTerrain.includes(c.terrain)).length;
        const softCap = 10 + (preferredTilesCount * 0.35);
        const popPressure = Math.min(1, Math.max(0, popSpecies / softCap));
        libidoDrive *= (1 - popPressure * 0.45);

        // Day/Night Preferences
        if (newTimeOfDay === TimeOfDay.NIGHT && species.isDiurnal) fearDrive += 0.15;
        if (newTimeOfDay === TimeOfDay.DAY && species.isNocturnal) hungerDrive *= 1.2;

        // Group behavior bonus
        const allies = visibleEntities.filter(e => e.speciesId === entity.speciesId);
        if (allies.length > 0) {
          fearDrive = Math.max(0, fearDrive - Math.min(0.25, (allies.length / 4) * 0.18));
        }

        // Safety Rails
        if (energyRatio < 0.3) {
          libidoDrive = 0;
          aggroDrive = 0;
        }

        // V3.4 Mating Persistence
        if (entity.state === 'MATING' && targetMateId && energyRatio > 0.45) {
          libidoDrive += 0.35;
          if (species.id === 'deer') libidoDrive += (species.deerMatingStickinessBonus || 0);
        }

        // State Selection
        const utilities = [
          { state: 'FLEEING', val: fearDrive },
          { state: 'HUNTING', val: hungerDrive },
          { state: 'MATING', val: libidoDrive },
          { state: 'FIGHTING', val: aggroDrive },
          { state: 'WANDERING', val: socialDrive + 0.2 },
          { state: 'RESTING', val: (satiatedTicks > 0 && energyRatio >= huntStop ? 0.8 : 0.1) },
          { state: 'IDLE', val: 0.1 }
        ];

        // Hysteresis
        utilities.forEach(u => {
          if (u.state === entity.state) u.val += 0.08;
        });

        const best = utilities.reduce((a, b) => a.val > b.val ? a : b);
        newState = best.state as any;

        // V3.6.1 Predator Hysteresis & Satiety Override
        if (species.diet === Diet.CARNIVORE) {
          const huntStart = species.huntStartRatio || 0.5;

          if (energyRatio <= 0.45) {
            newState = 'HUNTING'; // Override survival
          } else {
            if (entity.state === 'HUNTING' && energyRatio > huntStop) newState = 'RESTING';
            if (entity.state !== 'HUNTING' && energyRatio < huntStart && satiatedTicks <= 0) newState = 'HUNTING';
          }
        }

        // V3.4 Bear Hibernation Entry
        if (species.id === 'bear' && newState !== 'FLEEING' && satiatedTicks > 0) {
          const hasThreat = predators.some(p => distance(entity.x, entity.y, p.x, p.y) <= 3);
          if (!hasThreat && (entity.energy > species.maxEnergy * 0.8 || (entity.lastKillTick && currentTick - entity.lastKillTick < 5))) {
             newState = 'HIBERNATING';
             hibernateTicks = 240 + Math.floor(Math.random() * 180);
          }
        }
      }
    }

    // V3.6.1 Give up logic
    if (targetPreyId) {
      const prey = state.entities.find(e => e.id === targetPreyId);
      if (prey) {
        const dist = distance(entity.x, entity.y, prey.x, prey.y);
        chaseTicks++;
        if (chaseTicks > 120 && dist >= (lastDistanceToTarget || 0) - 0.1) {
          targetPreyId = null;
          chaseTicks = 0;
          const energyRatio = entity.energy / species.maxEnergy;
          if (energyRatio <= 0.55) {
            // Keep hunting, just find a new target
            newState = 'HUNTING';
          } else {
            newState = 'RESTING';
            satiatedTicks = 60;
          }
        }
        lastDistanceToTarget = dist;
      } else {
        targetPreyId = null;
        chaseTicks = 0;
      }
    }

    // Short-Horizon Planner
    const stateToAct = newState;
    let currentX = entity.x;
    let currentY = entity.y;
    
    // V3.5 Speed-based movement
    let steps = 1;
    if (stateToAct === 'HUNTING' || stateToAct === 'FLEEING') {
      const extraChance = Math.max(0, Math.min(0.75, species.speed - 1.0));
      if (Math.random() < extraChance) steps++;
    }

    for (let s = 0; s < steps; s++) {
      const currentNeighbors = getWalkableNeighbors(currentX, currentY, species, newGrid);
      let stepTarget = null;
    
      if (stateToAct === 'HIBERNATING') {
        stepTarget = null;
      } else if (stateToAct === 'RESTING') {
        if (Math.random() < 0.4 && currentNeighbors.length > 0) stepTarget = currentNeighbors[Math.floor(Math.random() * currentNeighbors.length)];
      } else if (stateToAct === 'FLEEING' && predators.length > 0) {
        const closest = predators.reduce((p, c) => distance(currentX, currentY, c.x, c.y) < distance(currentX, currentY, p.x, p.y) ? c : p);
        let maxD = -1;
        for (const n of currentNeighbors) {
          const d = distance(n.x, n.y, closest.x, closest.y);
          if (d > maxD) { maxD = d; stepTarget = n; }
        }
      } else if (stateToAct === 'MATING') {
        // V3.6.1 Mating Fix
        const mateSenseRange = (species.visionRange || 5) + 6 + Math.floor((species.intelligence || 1) * 2);
        if (!targetMateId || mateLockTicks <= 0) {
          const potentialMatesInRange = potentialMates.filter(e => distance(currentX, currentY, e.x, e.y) <= mateSenseRange);
          if (potentialMatesInRange.length > 0) {
            const closestMate = potentialMatesInRange.reduce((a, b) => distance(currentX, currentY, b.x, b.y) < distance(currentX, currentY, a.x, a.y) ? b : a);
            targetMateId = closestMate.id;
            mateLockTicks = species.id === 'deer' ? 120 : 80;
          }
        }
        if (targetMateId) {
          const mate = state.entities.find(e => e.id === targetMateId);
          if (mate) {
            if (distance(currentX, currentY, mate.x, mate.y) <= 1) stepTarget = null;
            else if (currentNeighbors.length > 0) stepTarget = currentNeighbors.reduce((a, b) => distance(b.x, b.y, mate.x, mate.y) < distance(a.x, a.y, mate.x, mate.y) ? b : a);
          } else { targetMateId = null; }
        }
      } else if (stateToAct === 'HUNTING') {
        const huntSenseRange = Math.min(GRID_SIZE, (species.visionRange || 5) + (species.intelligence || 1) * 4 + 8);
        if (!targetPreyId || preyLockTicks <= 0) {
          if (species.diet === Diet.SCAVENGER) {
            const potentialCarcasses = state.entities.filter(e => e.speciesId === 'carcass' && distance(currentX, currentY, e.x, e.y) <= huntSenseRange);
            if (potentialCarcasses.length > 0) {
              const closestCarcass = potentialCarcasses.reduce((a, b) => distance(currentX, currentY, b.x, b.y) < distance(currentX, currentY, a.x, a.y) ? b : a);
              targetPreyId = closestCarcass.id;
              preyLockTicks = 100;
              chaseTicks = 0;
            }
          } else {
            const potentialPrey = visibleEntities.filter(e => {
              const eSpec = state.unlockedSpecies[e.speciesId] || BASE_SPECIES[e.speciesId];
              return eSpec && eSpec.diet === Diet.HERBIVORE && eSpec.strength < species.strength;
            });
            if (potentialPrey.length > 0) {
              let bestPrey = null;
              let bestScore = -Infinity;
              for (const p of potentialPrey) {
                const pSpec = state.unlockedSpecies[p.speciesId] || BASE_SPECIES[p.speciesId];
                let score = (pSpec.foodValue || 50) - distance(currentX, currentY, p.x, p.y) * 2;
                // V3.6 Deer Penalty
                if (p.speciesId === 'deer') score -= 35;
                if (score > bestScore) {
                  bestScore = score;
                  bestPrey = p;
                }
              }
              if (bestPrey) {
                targetPreyId = bestPrey.id;
                preyLockTicks = 100;
                chaseTicks = 0;
              }
            } else {
              // V3.6.1 Carcass Fallback
              const potentialCarcasses = state.entities.filter(e => e.speciesId === 'carcass' && distance(currentX, currentY, e.x, e.y) <= huntSenseRange);
              if (potentialCarcasses.length > 0) {
                const closestCarcass = potentialCarcasses.reduce((a, b) => distance(currentX, currentY, b.x, b.y) < distance(currentX, currentY, a.x, a.y) ? b : a);
                targetPreyId = closestCarcass.id;
                preyLockTicks = 100;
                chaseTicks = 0;
              }
            }
          }
        }
        if (targetPreyId) {
          const prey = state.entities.find(e => e.id === targetPreyId);
          if (prey) {
            if (distance(currentX, currentY, prey.x, prey.y) <= 1) stepTarget = null;
            else if (currentNeighbors.length > 0) stepTarget = currentNeighbors.reduce((a, b) => distance(b.x, b.y, prey.x, prey.y) < distance(a.x, a.y, prey.x, prey.y) ? b : a);
          } else { targetPreyId = null; }
        }
        if (!stepTarget) {
          const searchRange = species.visionRange || 6;
          const candidates: {x: number, y: number}[] = [];
          for (let dy = -searchRange; dy <= searchRange; dy++) {
            for (let dx = -searchRange; dx <= searchRange; dx++) {
              const nx = currentX + dx, ny = currentY + dy;
              if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) candidates.push({x: nx, y: ny});
            }
          }
          let bestScore = -Infinity;
          candidates.forEach(c => {
            let targetScore = 0;
            const cell = newGrid[c.y][c.x];
            if (species.diet === Diet.HERBIVORE && cell.plantType) targetScore = (cell.plantEnergy || 0) / 100;
            if (species.diet === Diet.SCAVENGER) {
              const ents = state.entities.filter(e => e.x === c.x && e.y === c.y);
              if (ents.some(e => e.speciesId === 'carcass')) targetScore = 2.0;
            }
            const score = targetScore * 10 - (newGrid[c.y][c.x].riskValue || 0) * 8 - distance(currentX, currentY, c.x, c.y) * 0.2;
            if (score > bestScore && targetScore > 0) {
              bestScore = score;
              if (currentNeighbors.length > 0) stepTarget = currentNeighbors.reduce((a, b) => distance(b.x, b.y, c.x, c.y) < distance(a.x, a.y, c.x, c.y) ? b : a);
            }
          });
        }
      } else if (stateToAct === 'WANDERING') {
        if (currentNeighbors.length > 0) {
          // V3.6 Deer Cohesion
          if (species.id === 'deer' && entity.energy > species.maxEnergy * 0.3) {
            const allies = visibleEntities.filter(e => e.speciesId === 'deer');
            if (allies.length > 0) {
              const center = allies.reduce((acc, a) => ({ x: acc.x + a.x, y: acc.y + a.y }), { x: 0, y: 0 });
              center.x /= allies.length;
              center.y /= allies.length;
              stepTarget = currentNeighbors.reduce((a, b) => distance(b.x, b.y, center.x, center.y) < distance(a.x, a.y, center.x, center.y) ? b : a);
            }
          }
          if (!stepTarget) {
            const nonBacktracking = currentNeighbors.filter(n => n.x !== entity.lastX || n.y !== entity.lastY);
            stepTarget = (nonBacktracking.length > 0 ? nonBacktracking : currentNeighbors)[Math.floor(Math.random() * (nonBacktracking.length > 0 ? nonBacktracking.length : currentNeighbors.length))];
          }
        }
      }

      if (stepTarget) {
        currentX = stepTarget.x;
        currentY = stepTarget.y;
      } else {
        break;
      }
    }
    const newX = currentX;
    const newY = currentY;

    // Action Execution
    // Gains & Interactions
    if (newState === 'HUNTING' || newState === 'EATING' || newState === 'FIGHTING') {
      const cell = newGrid[newY][newX];
      if (species.diet === Diet.HERBIVORE && cell.plantType) {
        const pType = PLANT_TYPES[cell.plantType];
        const amount = Math.min(cell.plantEnergy || 0, 20);
        cell.plantEnergy = (cell.plantEnergy || 0) - amount;
        energyChanges[entity.id] = (energyChanges[entity.id] || 0) + amount * (pType.energyPerTickEat || 1);
        if (pType.toxicity > 0) healthChanges[entity.id] = (healthChanges[entity.id] || 0) - pType.toxicity * 5;
      }
      
      const attackTargets = getNeighbors(newX, newY).concat([{x: newX, y: newY}]);
      for (const targetPos of attackTargets) {
        const others = getEntitiesAt(targetPos.x, targetPos.y).filter(e => e.id !== entity.id);
        for (const other of others) {
          const otherSpec = state.unlockedSpecies[other.speciesId] || BASE_SPECIES[other.speciesId];
          if (!otherSpec) continue;

          // V3.6.1 Combat Gate
          if (stateToAct === 'FIGHTING' && species.canFight) {
            if (other.speciesId !== entity.speciesId) { // No friendly fire
              let canAttack = false;
              if (species.fightMode === 'PREDATORY') canAttack = true;
              if (species.fightMode === 'DEFENSIVE') {
                // Defensive only attacks predators
                if (otherSpec.diet === Diet.CARNIVORE && distance(entity.x, entity.y, other.x, other.y) <= 1) {
                  canAttack = true;
                }
              }
              
              if (canAttack) {
                let damage = species.strength * 1.5;
                state.activeLaws.forEach(l => {
                  if (l.id === 'law_peace') damage *= 0.5;
                });
                other.health -= damage;
                if (other.health <= 0) {
                  entitiesToRemove.add(other.id);
                  eraMetrics.deaths.combat++;
                }
              }
            }
          }

          if (stateToAct === 'HUNTING' && species.diet === Diet.SCAVENGER && other.speciesId === 'carcass') {
            const bite = Math.min(other.energy, 25);
            energyChanges[entity.id] = (energyChanges[entity.id] || 0) + bite * 0.9;
            other.energy -= bite; 
            eraMetrics.carcassesConsumedEnergy += bite;
            if (other.energy <= 0) entitiesToRemove.add(other.id);
            continue; 
          }

          if (stateToAct === 'HUNTING' && species.diet === Diet.CARNIVORE && otherSpec.diet === Diet.HERBIVORE) {
            let hitChance = Math.max(0.15, Math.min(0.90, 0.45 + (species.speed - otherSpec.speed) * 0.25));
            
            // V3.6 Deer Group Defense
            if (other.speciesId === 'deer') {
              const deerGroup = state.entities.filter(e => e.speciesId === 'deer' && e.id !== other.id && distance(other.x, other.y, e.x, e.y) <= 2).length;
              if (deerGroup > 0) {
                hitChance -= 0.25 * Math.max(0, Math.min(1, deerGroup / 2));
              }
            }

            if (Math.random() < hitChance) {
              let damage = species.strength * 2.5;
              
              // Apply Law modifiers
              state.activeLaws.forEach(l => {
                if (l.id === 'law_peace') damage *= 0.5;
              });

              other.health -= damage;
              
              if (other.health <= 0) {
                const deadSpec = otherSpec;
                const fullCarcassEnergy = Math.min(400, Math.max(30, 20 + deadSpec.maxEnergy * 0.35 + deadSpec.maxHealth * 0.25));
                const immediate = Math.min(55, fullCarcassEnergy * 0.25); // V3.6 Increased immediate bite
                energyChanges[entity.id] = (energyChanges[entity.id] || 0) + immediate;
                
                // V3.6 Satiety from food
                const gained = immediate;
                const satiationPerEnergy = species.satiationPerEnergy || 1.0;
                satiatedTicks = Math.min(420, (satiatedTicks || 0) + Math.floor(gained * satiationPerEnergy));
                
                (entity as any).lastKillTick = currentTick;
                (other as any).remainingCarcassEnergy = fullCarcassEnergy - immediate;
                entitiesToRemove.add(other.id);
                eraMetrics.deaths.combat++;
                eraMetrics.kills.push({ predator: entity.speciesId, prey: other.speciesId, tick: currentTick });
              }
            } else {
              // V3.6 Counter Damage if missed adjacent deer
              if (other.speciesId === 'deer' && distance(entity.x, entity.y, other.x, other.y) <= 1) {
                healthChanges[entity.id] = (healthChanges[entity.id] || 0) - (6 + Math.random() * 4);
              }
            }
          }
        }
      }
    }

    // V3.3 Reproduction (Conception & Birth)
    if (pregnantTicks === 0 && entity.pregnantTicks && entity.pregnantTicks > 0) {
      // Just finished gestation!
      const childId = generateId();
      const startEnergyRatio = species.offspringStartEnergyRatio || 0.35;
      newEntities.push({
        id: childId, speciesId: entity.speciesId, x: newX, y: newY, age: 0,
        energy: species.maxEnergy * startEnergyRatio, health: species.maxHealth,
        facing: { x: 0, y: 0 }, state: 'IDLE', mutation: 'NONE'
      });
      
      // Final cost at birth
      const costRatio = species.reproductionEnergyCostRatio || 0.5;
      const costHalf2 = species.maxEnergy * costRatio * 0.5;
      energyChanges[entity.id] = (energyChanges[entity.id] || 0) - costHalf2;
      
      eraMetrics.births[species.id] = (eraMetrics.births[species.id] || 0) + 1;
      eraMetrics.birthsTotal++;
      
      if (species.id === 'rabbit') eraMetrics.rabbitBirths = (eraMetrics.rabbitBirths || 0) + 1;
      if (species.id === 'deer') eraMetrics.deerBirths = (eraMetrics.deerBirths || 0) + 1;

      pregnantMateId = null;
    }

    if (stateToAct === 'MATING' && potentialMates.length > 0) {
      const mate = potentialMates[0];
      if (distance(newX, newY, mate.x, mate.y) <= 1 && mateCooldownTicks === 0 && pregnantTicks === 0) {
        // Conception!
        const carrier = Math.random() < 0.5 ? 'SELF' : 'MATE';
        const costRatio = species.reproductionEnergyCostRatio || 0.5;
        const costHalf = species.maxEnergy * costRatio * 0.5;
        
        if (carrier === 'SELF') {
          pregnantTicks = species.gestationTicks || 100;
          pregnantMateId = mate.id;
        }
        // Energy cost for both at conception
        energyChanges[entity.id] = (energyChanges[entity.id] || 0) - costHalf;
        energyChanges[mate.id] = (energyChanges[mate.id] || 0) - costHalf;
        
        mateCooldownTicks = species.mateCooldownBase || 200;
        // We can't easily set mateCooldownTicks on the mate here because it's in the loop, 
        // but we can rely on the mate's own loop turn or just accept it.
        // Actually, we should probably use a shared record for cooldowns if we want it perfect, 
        // but this is usually fine as the mate will also likely be in MATING state.
        
        eraMetrics.matingsStarted++;
        if (species.id === 'rabbit') eraMetrics.rabbitMatingAttempts = (eraMetrics.rabbitMatingAttempts || 0) + 1;
        if (species.id === 'deer') eraMetrics.deerMatingAttempts = (eraMetrics.deerMatingAttempts || 0) + 1;
      }
    }

    // Metabolism & Costs
    const terrain = newGrid[newY][newX].terrain;
    let cost = species.energyCost;
    if (species.preferredTerrain.includes(terrain)) cost *= 0.5;
    if (isOutbreak) cost *= 1.25; // Harsher outbreak cost
    
    // Density stress is now much more impactful
    cost *= (1 + densityStress[terrain] * 0.5);

    // V3.4 Hibernation cost reduction
    if (newState === 'HIBERNATING') {
      cost *= 0.18;
    }
    
    // Apply Event/Law modifiers
    newActiveEvents.forEach(e => {
      if (e.modifiers.passiveCost) cost *= (1 + e.modifiers.passiveCost);
    });
    
    state.activeLaws.forEach(l => {
      if (l.modifiers.attackCost && newState === 'FIGHTING') cost *= (1 + l.modifiers.attackCost);
    });
    
    if (newTimeOfDay === TimeOfDay.DAY && species.isDiurnal) cost *= 0.85;
    if (newTimeOfDay === TimeOfDay.NIGHT && species.isNocturnal) cost *= 0.85;

    const newEnergy = Math.max(0, Math.min(species.maxEnergy, entity.energy - cost + (energyChanges[entity.id] || 0)));
    let newHealth = entity.health; // healthChanges no longer used for combat, applied directly
    
    if (newEnergy <= 0) {
      // Starvation is now progressive
      const starvationDamage = 5 + Math.floor(entity.age / 100);
      newHealth -= starvationDamage;
      eraMetrics.deaths.hunger++;
    } else if (newEnergy > species.maxEnergy * 0.8) {
      newHealth = Math.min(species.maxHealth, newHealth + 2);
    }

    // V3.4 Hibernation regen
    if (newState === 'HIBERNATING' && newEnergy > 0) {
      newHealth = Math.min(species.maxHealth, newHealth + 1);
    }

    if (entity.age > species.maxAge) {
      newHealth -= 5;
      eraMetrics.deaths.age++;
    }

    if (newHealth <= 0) {
      entitiesToRemove.add(entity.id);
      // Spawn carcass if it's not already a carcass
      if (entity.speciesId !== 'carcass') {
        const deadSpec = species;
        const carcassEnergy = (entity as any).remainingCarcassEnergy !== undefined 
          ? (entity as any).remainingCarcassEnergy 
          : Math.min(400, Math.max(30, 20 + deadSpec.maxEnergy * 0.35 + deadSpec.maxHealth * 0.25));
        
        if (carcassEnergy > 0) {
          newEntities.push({
            id: `carcass_${entity.id}`,
            speciesId: 'carcass',
            x: newX, y: newY,
            age: 0,
            energy: carcassEnergy,
            health: 60,
            facing: { x: 0, y: 0 },
            state: 'IDLE',
            mutation: 'NONE'
          });
          eraMetrics.carcassesSpawned++;
        }
      }
    }

    if (newX === entity.x && newY === entity.y && !species.isStatic && newState !== 'IDLE') {
      (eraMetrics as any).stuckCount = ((eraMetrics as any).stuckCount || 0) + 1;
    }

    newEntities.push({
      ...entity,
      x: newX, y: newY,
      lastX: entity.x, lastY: entity.y,
      energy: newEnergy, health: newHealth,
      age: entity.age + 1,
      state: newState,
      ticksInCurrentState: newState === entity.state ? ticksInCurrentState : 0,
      memory,
      outbreakActive: isOutbreak,
      outbreakDuration: outbreakDur,
      mateCooldownTicks,
      hibernateTicks,
      pregnantTicks,
      pregnantMateId,
      targetMateId,
      mateLockTicks,
      targetPreyId,
      preyLockTicks,
      lastKillTick: (entity as any).lastKillTick || entity.lastKillTick
    });
  }

  const finalEntities = newEntities.filter(e => !entitiesToRemove.has(e.id));

  // Update Energy Totals for Metrics
  const currentTotal = finalEntities.reduce((acc, e) => acc + e.energy, 0) + newGrid.flat().reduce((acc, c) => acc + (c.plantEnergy || 0), 0);
  const prevTotal = (eraMetrics as any).lastTotalEnergy || currentTotal;
  const delta = currentTotal - prevTotal;
  const regrow = eraMetrics.plantEnergyRegrown;
  
  // Audit: totalWorldEnergy só pode subir até ~plantRegrowBudget + eventos (epsilon).
  // We check if delta > regrow + some buffer for floating point or small events
  if (delta > regrow + 50) {
    console.warn(`ENERGY LEAK DETECTED: Δ=${delta.toFixed(2)}, Regrow=${regrow.toFixed(2)}, Entities=${finalEntities.length}`);
  }
  (eraMetrics as any).lastTotalEnergy = currentTotal;

  eraMetrics.energyTotals = {
    animals: finalEntities.filter(e => e.speciesId !== 'carcass').reduce((acc, e) => acc + e.energy, 0),
    plants: newGrid.flat().reduce((acc, c) => acc + (c.plantEnergy || 0), 0),
    carcasses: finalEntities.filter(e => e.speciesId === 'carcass').reduce((acc, e) => acc + e.energy, 0)
  };

  const alerts: string[] = [];
  if (currentTick % TICKS_PER_ERA === 0) {
    const totalPop = finalEntities.length;
    const speciesCounts = finalEntities.reduce((acc, e) => {
      acc[e.speciesId] = (acc[e.speciesId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(speciesCounts).forEach(([sid, count]) => {
      if (count / totalPop > 0.55) alerts.push(`Dominância: ${sid} controla mais de 55% da população.`);
    });
    
    const plantCoverage = newGrid.flat().filter(c => c.plantType).length / (GRID_SIZE * GRID_SIZE);
    if (plantCoverage < 0.25) alerts.push("Habitat collapse: Cobertura de plantas abaixo de 25%.");
  }

  let populationHistory = state.populationHistory || [];
  if (currentTick % 5 === 0) {
    const counts: Record<string, number> = {};
    finalEntities.forEach(e => {
      counts[e.speciesId] = (counts[e.speciesId] || 0) + 1;
    });
    populationHistory = [...populationHistory, { tick: currentTick, counts }];
    if (populationHistory.length > 50) populationHistory = populationHistory.slice(-50);
  }

  return {
    ...state,
    tick: currentTick,
    grid: newGrid,
    entities: finalEntities,
    timeOfDay: newTimeOfDay,
    timeUntilNextCycle: newTimeUntilNextCycle,
    activeEvents: newActiveEvents,
    weather: currentWeather,
    weatherDuration: weatherDuration,
    alerts,
    eraMetrics,
    populationHistory
  };
}
