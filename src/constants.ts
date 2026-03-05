import { Diet, Species, Terrain, Weather, PlantType } from './types';

export const GRID_SIZE = 24;
export const TICKS_PER_ERA = 300; // Increased to allow stabilization

export const DAY_LENGTH = 180;
export const NIGHT_LENGTH = 120;

export const PLANT_TYPES: Record<string, PlantType> = {
  'algae': {
    id: 'algae',
    name: 'Algae',
    energyPerTickEat: 1.2,
    regrowPerTick: 0.9,
    maxCoveragePerBiome: { [Terrain.WATER]: 0.65, [Terrain.DIRT]: 0, [Terrain.GRASS]: 0, [Terrain.FOREST]: 0, [Terrain.MOUNTAIN]: 0 },
    shelterValue: 0.2,
    toxicity: 0,
    preferredTerrain: [Terrain.WATER]
  },
  'tough_grass': {
    id: 'tough_grass',
    name: 'Tough Grass',
    energyPerTickEat: 1.5,
    regrowPerTick: 0.35,
    maxCoveragePerBiome: { [Terrain.GRASS]: 0.75, [Terrain.DIRT]: 0.2, [Terrain.WATER]: 0, [Terrain.FOREST]: 0.1, [Terrain.MOUNTAIN]: 0 },
    shelterValue: 0.3,
    toxicity: 0,
    preferredTerrain: [Terrain.GRASS]
  },
  'berry_bush': {
    id: 'berry_bush',
    name: 'Berry Bush',
    energyPerTickEat: 3.0,
    regrowPerTick: 0.25,
    maxCoveragePerBiome: { [Terrain.FOREST]: 0.35, [Terrain.GRASS]: 0.20, [Terrain.DIRT]: 0, [Terrain.WATER]: 0, [Terrain.MOUNTAIN]: 0 },
    shelterValue: 0.6,
    toxicity: 0,
    preferredTerrain: [Terrain.FOREST, Terrain.GRASS]
  },
  'toxic_mushroom': {
    id: 'toxic_mushroom',
    name: 'Toxic Mushroom',
    energyPerTickEat: 3.6,
    regrowPerTick: 0.18,
    maxCoveragePerBiome: { [Terrain.FOREST]: 0.30, [Terrain.DIRT]: 0, [Terrain.GRASS]: 0, [Terrain.WATER]: 0, [Terrain.MOUNTAIN]: 0 },
    shelterValue: 0.4,
    toxicity: 0.35,
    preferredTerrain: [Terrain.FOREST]
  }
};

export const BASE_SPECIES: Record<string, Species> = {
  'rabbit': {
    id: 'rabbit', name: 'Rabbit', diet: Diet.HERBIVORE, color: '#60a5fa', emoji: '🐇',
    maxAge: 600, maxEnergy: 200, energyCost: 0.45, foodValue: 80, reproduceThreshold: 140,
    preferredTerrain: [Terrain.GRASS],
    movementTypes: ['WALK'],
    maxHealth: 35, strength: 2, speed: 1.15, efficiency: 1.2, intelligence: 3, visionRange: 5, visionAngle: 360,
    personality: { fear: 1.0, hunger: 0.8, libido: 0.85, aggression: 0.1, social: 0.5 },
    isDiurnal: true,
    gestationTicks: 140,
    mateCooldownBase: 240,
    minMateAgeRatio: 0.25,
    minMateEnergyRatio: 0.82,
    reproductionEnergyCostRatio: 0.45,
    offspringStartEnergyRatio: 0.35,
    canFight: false,
    fightMode: 'NONE'
  },
  'deer': {
    id: 'deer', name: 'Deer', diet: Diet.HERBIVORE, color: '#fbbf24', emoji: '🦌',
    maxAge: 700, maxEnergy: 180, energyCost: 0.35, foodValue: 150, reproduceThreshold: 90,
    preferredTerrain: [Terrain.FOREST, Terrain.GRASS],
    movementTypes: ['WALK'],
    maxHealth: 50, strength: 6, speed: 1.10, efficiency: 1.1, intelligence: 4, visionRange: 10, visionAngle: 320,
    personality: { fear: 0.7, hunger: 0.8, libido: 1.0, aggression: 0.2, social: 0.8 },
    isDiurnal: true,
    gestationTicks: 180,
    mateCooldownBase: 300,
    minMateAgeRatio: 0.28,
    minMateEnergyRatio: 0.74,
    reproductionEnergyCostRatio: 0.5,
    offspringStartEnergyRatio: 0.35,
    deerMatingStickinessBonus: 0.45,
    canFight: true,
    fightMode: 'DEFENSIVE'
  },
  'wolf': {
    id: 'wolf', name: 'Wolf', diet: Diet.CARNIVORE, color: '#f87171', emoji: '🐺',
    maxAge: 800, maxEnergy: 250, energyCost: 0.45, foodValue: 120, reproduceThreshold: 210,
    preferredTerrain: [Terrain.FOREST, Terrain.MOUNTAIN],
    movementTypes: ['WALK'],
    maxHealth: 80, strength: 20, speed: 1.30, efficiency: 0.9, intelligence: 8, visionRange: 12, visionAngle: 100,
    personality: { fear: 0.2, hunger: 0.9, libido: 0.5, aggression: 0.8, social: 0.9 },
    isNocturnal: true,
    gestationTicks: 220,
    mateCooldownBase: 360,
    minMateAgeRatio: 0.30,
    minMateEnergyRatio: 0.75,
    reproductionEnergyCostRatio: 0.5,
    offspringStartEnergyRatio: 0.35,
    huntStartRatio: 0.65,
    huntStopRatio: 0.88,
    baseSatiatedTicks: 140,
    satiationPerEnergy: 2.2,
    restingCostMultiplier: 0.35,
    canFight: true,
    fightMode: 'PREDATORY'
  },
  'bear': {
    id: 'bear', name: 'Bear', diet: Diet.CARNIVORE, color: '#78350f', emoji: '🐻',
    maxAge: 1000, maxEnergy: 800, energyCost: 0.6, foodValue: 300, reproduceThreshold: 600,
    preferredTerrain: [Terrain.MOUNTAIN, Terrain.FOREST],
    movementTypes: ['WALK'],
    maxHealth: 200, strength: 60, speed: 1.05, efficiency: 0.8, intelligence: 6, visionRange: 15, visionAngle: 140,
    personality: { fear: 0.1, hunger: 0.7, libido: 0.4, aggression: 0.9, social: 0.1 },
    gestationTicks: 300,
    mateCooldownBase: 450,
    minMateAgeRatio: 0.35,
    minMateEnergyRatio: 0.75,
    reproductionEnergyCostRatio: 0.5,
    offspringStartEnergyRatio: 0.35,
    huntStartRatio: 0.45,
    huntStopRatio: 0.85,
    baseSatiatedTicks: 240,
    canFight: true,
    fightMode: 'PREDATORY'
  },
  'vulture': {
    id: 'vulture', name: 'Vulture', diet: Diet.SCAVENGER, color: '#52525b', emoji: '🦅',
    maxAge: 350, maxEnergy: 180, energyCost: 0.5, foodValue: 50, reproduceThreshold: 100,
    preferredTerrain: [Terrain.MOUNTAIN, Terrain.DIRT],
    movementTypes: ['FLY'],
    maxHealth: 40, strength: 2, speed: 1.5, efficiency: 1.5, intelligence: 6, visionRange: 20, visionAngle: 180,
    personality: { fear: 0.3, hunger: 1.0, libido: 0.4, aggression: 0.0, social: 0.3 },
    gestationTicks: 180,
    mateCooldownBase: 280,
    minMateAgeRatio: 0.30,
    minMateEnergyRatio: 0.75,
    reproductionEnergyCostRatio: 0.5,
    offspringStartEnergyRatio: 0.35,
    canFight: false,
    fightMode: 'NONE'
  },
  'fish': {
    id: 'fish', name: 'Fish', diet: Diet.HERBIVORE, color: '#38bdf8', emoji: '🐟',
    maxAge: 500, maxEnergy: 140, energyCost: 0.25, foodValue: 60, reproduceThreshold: 80,
    preferredTerrain: [Terrain.WATER],
    movementTypes: ['SWIM'],
    maxHealth: 25, strength: 2, speed: 1.1, efficiency: 1.2, intelligence: 2, visionRange: 6, visionAngle: 360,
    personality: { fear: 0.6, hunger: 0.8, libido: 0.8, aggression: 0.1, social: 0.7 },
    gestationTicks: 120,
    mateCooldownBase: 240,
    minMateAgeRatio: 0.20,
    minMateEnergyRatio: 0.75,
    reproductionEnergyCostRatio: 0.4,
    offspringStartEnergyRatio: 0.3,
    canFight: false,
    fightMode: 'NONE'
  },
  'carcass': {
    id: 'carcass', name: 'Carcass', diet: Diet.NONE, color: '#ef4444', emoji: '🥩',
    maxAge: 600, maxEnergy: 300, energyCost: 0, foodValue: 0, reproduceThreshold: 9999,
    preferredTerrain: [Terrain.DIRT, Terrain.GRASS, Terrain.FOREST, Terrain.MOUNTAIN, Terrain.WATER],
    movementTypes: [],
    isStatic: true,
    maxHealth: 60, strength: 0, speed: 0, efficiency: 1, intelligence: 0, visionRange: 0, visionAngle: 360
  }
};

export const TERRAIN_COLORS: Record<Terrain, string> = {
  [Terrain.DIRT]: '#5c3a21',
  [Terrain.GRASS]: '#22c55e',
  [Terrain.WATER]: '#3b82f6',
  [Terrain.FOREST]: '#14532d',
  [Terrain.MOUNTAIN]: '#52525b'
};

export const WEATHER_COLORS: Record<Weather, string> = {
  [Weather.NORMAL]: 'transparent',
  [Weather.DROUGHT]: 'rgba(245, 158, 11, 0.15)', // Amber tint
  [Weather.WINTER]: 'rgba(255, 255, 255, 0.2)', // White tint
  [Weather.RAIN]: 'rgba(59, 130, 246, 0.15)' // Blue tint
};

export const WORLD_LAWS: Record<string, any> = {
  'law_nocturnal': { id: 'law_nocturnal', name: 'Night Prowlers', modifiers: { attackCost: -0.2 } },
  'law_fertile': { id: 'law_fertile', name: 'Fertile Soil', modifiers: { regrowRate: 0.3, passiveCost: 0.05 } },
  'law_peace': { id: 'law_peace', name: 'Divine Peace', modifiers: { attackCost: 0.5 } }
};

export const ECO_EVENTS: Record<string, any> = {
  'event_bloom': { id: 'event_bloom', name: 'Great Bloom', modifiers: { plantGrowth: 0.5 } },
  'event_migration': { id: 'event_migration', name: 'Mass Migration', modifiers: { passiveCost: -0.1 } },
  'event_plague': { id: 'event_plague', name: 'Genetic Plague', modifiers: { passiveCost: 0.2 } }
};
