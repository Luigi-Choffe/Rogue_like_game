export enum Terrain {
  DIRT = 'DIRT',
  GRASS = 'GRASS',
  WATER = 'WATER',
  FOREST = 'FOREST',
  MOUNTAIN = 'MOUNTAIN'
}

export enum Diet {
  PLANT = 'PLANT',
  HERBIVORE = 'HERBIVORE',
  CARNIVORE = 'CARNIVORE',
  SCAVENGER = 'SCAVENGER',
  NONE = 'NONE'
}

export enum Weather {
  NORMAL = 'NORMAL',
  DROUGHT = 'DROUGHT',
  WINTER = 'WINTER',
  RAIN = 'RAIN'
}

export enum TimeOfDay {
  DAY = 'DAY',
  NIGHT = 'NIGHT'
}

export type Mutation = 'NONE' | 'FAST' | 'POISONOUS' | 'STRONG' | 'EFFICIENT';
export type MovementType = 'WALK' | 'SWIM' | 'FLY';

export interface PlantType {
  id: string;
  name: string;
  energyPerTickEat: number;
  regrowPerTick: number;
  maxCoveragePerBiome: Record<Terrain, number>;
  shelterValue: number;
  toxicity: number;
  preferredTerrain: Terrain[];
}

export interface Species {
  id: string;
  name: string;
  diet: Diet;
  color: string;
  emoji: string;
  maxAge: number;
  maxEnergy: number;
  energyCost: number;
  foodValue: number;
  reproduceThreshold: number;
  preferredTerrain: Terrain[];
  movementTypes: MovementType[];
  isStatic?: boolean;
  
  // Stats
  maxHealth: number;
  strength: number;
  speed: number;
  efficiency: number;
  intelligence: number;
  visionRange: number;
  visionAngle: number;
  generation?: number;
  
  personality?: {
    fear: number;
    hunger: number;
    libido: number;
    aggression: number;
    social: number;
  };

  // V2 Properties
  isNocturnal?: boolean;
  isDiurnal?: boolean;
  shelterTolerance?: number;

  // V3.3 Properties
  gestationTicks?: number;
  mateCooldownBase?: number;
  minMateAgeRatio?: number;
  minMateEnergyRatio?: number;
  reproductionEnergyCostRatio?: number;
  offspringStartEnergyRatio?: number;
  deerMatingStickinessBonus?: number;
  huntStartRatio?: number;
  huntStopRatio?: number;
  baseSatiatedTicks?: number;
  satiationPerEnergy?: number;
  restingCostMultiplier?: number;
  canFight?: boolean;
  fightMode?: 'NONE' | 'DEFENSIVE' | 'PREDATORY';
}

export interface Entity {
  id: string;
  speciesId: string;
  x: number;
  y: number;
  age: number;
  energy: number;
  health: number;
  facing: { x: number, y: number };
  state: 'WANDERING' | 'FLEEING' | 'HUNTING' | 'MATING' | 'EATING' | 'IDLE' | 'FIGHTING' | 'PROTECTING' | 'HIBERNATING' | 'RESTING';
  lastX?: number;
  lastY?: number;
  mutation: Mutation;
  memory?: { x: number, y: number, type: 'FOOD' | 'WATER' | 'THREAT' }[];
  ticksInCurrentState?: number;
  
  // V2 Properties
  outbreakActive?: boolean;
  outbreakDuration?: number;
  preyPressure?: Record<string, number>;

  // V3.3 Properties
  mateCooldownTicks?: number;
  pregnantTicks?: number;
  pregnantMateId?: string | null;

  // V3.4 Properties
  targetMateId?: string | null;
  mateLockTicks?: number;
  targetPreyId?: string | null;
  preyLockTicks?: number;
  lastKillTick?: number;
  hibernateTicks?: number;

  // V3.5 Properties
  satiatedTicks?: number;
  chaseTicks?: number;
  lastDistanceToTarget?: number;
}

export interface Cell {
  x: number;
  y: number;
  terrain: Terrain;
  moisture: number;
  plantType?: string;
  plantEnergy?: number;
  riskValue?: number;
}

export type CardType = 'SPECIES' | 'PLANT' | 'CLIMATE_EVENT' | 'WORLD_LAW' | 'DIVINE_TOOL' | 'TERRAIN' | 'CREATE_SPECIES' | 'DISASTER' | 'ECO_EVENT';

export interface DraftOption {
  id: string;
  title: string;
  description: string;
  type: CardType;
  data: any;
  emoji: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  downside?: string;
}

export interface EcoEvent {
  id: string;
  name: string;
  duration: number;
  modifiers: {
    plantGrowth?: number;
    passiveCost?: number;
    waterAvailability?: number;
    thirstCost?: number;
  };
}

export interface WorldLaw {
  id: string;
  name: string;
  modifiers: {
    attackCost?: number;
    preyRegen?: number;
    regrowRate?: number;
    outbreakThreshold?: number;
    migrationTendency?: number;
  };
}

export type GameStatus = 'MENU' | 'DRAFTING' | 'PLACING' | 'SIMULATING' | 'ERA_SUMMARY' | 'GAME_OVER' | 'CREATING_SPECIES';

export interface GameState {
  status: GameStatus;
  era: number;
  tick: number;
  grid: Cell[][];
  entities: Entity[];
  unlockedSpecies: Record<string, Species>;
  draftOptions: DraftOption[];
  selectedDraft: DraftOption | null;
  lastActionDescription: string;
  eraStartStats: Record<string, number>;
  eraSummary: string;
  isGeneratingSummary: boolean;
  weather: Weather;
  weatherDuration: number;
  divinePower?: string;
  divinePowerDuration?: number;
  populationHistory: { tick: number; counts: Record<string, number> }[];

  // V2 State
  timeOfDay: TimeOfDay;
  timeUntilNextCycle: number;
  activeEvents: EcoEvent[];
  activeLaws: WorldLaw[];
  alerts: string[];
  worldSeed: number;
  eraMetrics: {
    births: Record<string, number>;
    deaths: { hunger: number, combat: number, climate: number, age: number };
    kills: { predator: string, prey: string, tick?: number }[];
    popHistory: any[];
    energyTotals: { animals: number, plants: number, carcasses: number };
    birthsTotal: number;
    matingsStarted: number;
    carcassesSpawned: number;
    carcassesConsumedEnergy: number;
    plantEnergyConsumed: number;
    plantEnergyRegrown: number;
    rabbitReserveTriggeredCount?: number;
    grassSpreadConversions?: number;
    rabbitCanMateTicks?: number;
    rabbitMatingAttempts?: number;
    rabbitBirths?: number;
    deerCanMateTicks?: number;
    deerMatingAttempts?: number;
    deerBirths?: number;
  };
  selectedEntityId?: string | null;
}
