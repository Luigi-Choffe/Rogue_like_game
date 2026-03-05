import React, { useState, useEffect } from 'react';
import { GameState, Terrain, DraftOption, Species, Diet, Weather, Mutation, MovementType, TimeOfDay, Entity } from './types';
import { createInitialState, tickSimulation, generateId, evolveSpecies } from './engine';
import { GRID_SIZE, BASE_SPECIES, TERRAIN_COLORS, TICKS_PER_ERA, WEATHER_COLORS, PLANT_TYPES, WORLD_LAWS, ECO_EVENTS } from './constants';
import { generateEraSummary } from './ai';
import { runAllTests } from './testRunner';
import { Droplet, Play, RotateCcw, FastForward, Info, TreePine, Zap, Heart, Settings2, ShieldCheck, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const EMOJI_LIST = ['👽','🦖','🐉','🐙','🦧','🦥','🦦','🦔','🦇','🦂','🕷️','🐍','🐢','🦕','🦤','🦩','🦚','🦜','🦄','🦀','🦑'];
const MAX_GENETIC_POINTS = 600;

function calculateGeneticPoints(form: any) {
  let pts = Math.floor(
    (form.intelligence * 20) +
    (form.maxAge * 0.05) +
    (form.maxEnergy * 0.15) +
    ((2 - form.energyCost) * 100) + // Lower cost is much more expensive
    ((400 - form.reproduceThreshold) * 0.2) +
    (form.visionRange * 15) +
    (form.speed * 40) +
    (form.maxHealth * 0.5) +
    (form.strength * 5) +
    (form.personality.fear * 10) +
    (form.personality.hunger * 10) +
    (form.personality.libido * 30) +
    (form.personality.aggression * 20) +
    (form.personality.social * 10)
  );
  
  if (form.movementType === 'FLY') pts += 80;
  if (form.movementType === 'SWIM') pts += 30;
  if (form.diet === Diet.CARNIVORE) pts += 50;
  if (form.diet === Diet.SCAVENGER) pts += 20;
  
  return pts;
}

function generateDraftOptions(unlocked: Record<string, Species>, alerts: string[], entities: Entity[]): DraftOption[] {
  const options: DraftOption[] = [];
  const locked = Object.values(BASE_SPECIES).filter(s => !unlocked[s.id] && s.id !== 'carcass' && s.id !== 'berry');
  const unlockedList = Object.values(unlocked).filter(s => s.id !== 'carcass' && s.id !== 'berry');
  
  const speciesPopCounts: Record<string, number> = {};
  entities.forEach(e => {
    speciesPopCounts[e.speciesId] = (speciesPopCounts[e.speciesId] || 0) + 1;
  });

  // 1. Alert-Driven Weights
  const needsFood = alerts.some(a => a.includes('collapse'));
  const needsControl = alerts.some(a => a.includes('Dominância'));

  // 2. Rarity & Card Types
  const getRarity = () => {
    const r = Math.random();
    if (r < 0.1) return 'LEGENDARY';
    if (r < 0.3) return 'RARE';
    return 'COMMON';
  };

  // 3. Species / Plant Cards
  if (locked.length > 0) {
    const randomSpecies = locked[Math.floor(Math.random() * locked.length)];
    options.push({
      id: `unlock_${randomSpecies.id}`,
      title: `Introduce ${randomSpecies.name}`,
      description: `Add a new species to your world. Diet: ${randomSpecies.diet}`,
      type: 'SPECIES',
      rarity: getRarity(),
      data: { speciesId: randomSpecies.id, isNew: true },
      emoji: randomSpecies.emoji
    });
  }

  // V3.4 Reintroduction logic
  const extinctUnlocked = unlockedList.filter(s => !speciesPopCounts[s.id] || speciesPopCounts[s.id] === 0);
  if (extinctUnlocked.length > 0) {
    const s = extinctUnlocked[Math.floor(Math.random() * extinctUnlocked.length)];
    options.push({
      id: `reintroduce_${s.id}`,
      title: `Reintroduce ${s.name}`,
      description: `Bring back the extinct ${s.name} population.`,
      type: 'SPECIES',
      rarity: 'RARE',
      data: { speciesId: s.id, isNew: false },
      emoji: '♻️'
    });
  }

  // V3.4 Spawn more cards
  if (unlockedList.length > 0 && Math.random() < 0.4) {
    const s = unlockedList[Math.floor(Math.random() * unlockedList.length)];
    options.push({
      id: `spawn_more_${s.id}`,
      title: `Spawn more ${s.name}s`,
      description: `Increase the population of ${s.name}s immediately.`,
      type: 'SPECIES',
      rarity: 'COMMON',
      data: { speciesId: s.id, isNew: false },
      emoji: s.emoji
    });
  }

  // 4. World Laws (New V2 Type)
  const laws = [
    { id: 'law_nocturnal', title: 'Night Prowlers', desc: 'Nocturnal species gain +20% efficiency.', rarity: 'RARE', downside: 'Diurnal species lose -10% health.' },
    { id: 'law_fertile', title: 'Fertile Soil', desc: 'Plants regrow 30% faster.', rarity: 'COMMON', downside: 'Animals use 5% more energy.' },
    { id: 'law_peace', title: 'Divine Peace', desc: 'Carnivores are 50% less aggressive.', rarity: 'LEGENDARY', downside: 'Herbivores reproduce 20% slower.' }
  ];
  const law = laws[Math.floor(Math.random() * laws.length)];
  options.push({
    id: law.id,
    title: law.title,
    description: law.desc,
    type: 'WORLD_LAW',
    rarity: law.rarity as any,
    downside: law.downside,
    data: { lawId: law.id },
    emoji: '📜'
  });

  // 5. Eco Events (New V2 Type)
  const events = [
    { id: 'event_bloom', title: 'Great Bloom', desc: 'Massive plant growth for 1 era.', rarity: 'RARE' },
    { id: 'event_migration', title: 'Mass Migration', desc: 'Animals move 50% faster.', rarity: 'COMMON' },
    { id: 'event_plague', title: 'Genetic Plague', desc: 'High mutation, but lower health.', rarity: 'RARE' }
  ];
  const event = events[Math.floor(Math.random() * events.length)];
  options.push({
    id: event.id,
    title: event.title,
    description: event.desc,
    type: 'ECO_EVENT',
    rarity: event.rarity as any,
    data: { eventId: event.id },
    emoji: '⚡'
  });

  // 6. Create Species (Rare/Legendary)
  if (Math.random() < 0.2) {
    options.push({
      id: 'create_species_card',
      title: 'Divine Creation',
      description: 'Engineer a custom species from scratch in your laboratory.',
      type: 'CREATE_SPECIES',
      rarity: Math.random() < 0.3 ? 'LEGENDARY' : 'RARE',
      data: {},
      emoji: '🧬'
    });
  }

  // 7. Disasters (Common/Rare)
  if (Math.random() < 0.15) {
    const disasters = [
      { id: 'disaster_drought', title: 'Great Drought', desc: 'Heat waves scorch the land.', rarity: 'RARE', weather: Weather.DROUGHT },
      { id: 'disaster_winter', title: 'Eternal Winter', desc: 'A deep freeze settles in.', rarity: 'RARE', weather: Weather.WINTER },
      { id: 'disaster_meteor', title: 'Meteor Strike', desc: 'Divine fire from the sky.', rarity: 'LEGENDARY', power: 'power_meteor' }
    ];
    const d = disasters[Math.floor(Math.random() * disasters.length)];
    options.push({
      id: d.id,
      title: d.title,
      description: d.desc,
      type: 'DISASTER',
      rarity: d.rarity as any,
      data: { weather: d.weather, power: d.power },
      emoji: '☄️'
    });
  }

  // 8. Terrain options
  const terrains = [
    { id: 'terrain_water', title: 'Create Lake', description: 'Place a body of water.', type: 'TERRAIN', rarity: 'COMMON', data: { terrain: Terrain.WATER }, emoji: '💧' },
    { id: 'terrain_forest', title: 'Grow Forest', description: 'Place dense forest terrain.', type: 'TERRAIN', rarity: 'COMMON', data: { terrain: Terrain.FOREST }, emoji: '🌲' }
  ];
  options.push(terrains[Math.floor(Math.random() * terrains.length)] as DraftOption);

  return options.sort(() => 0.5 - Math.random()).slice(0, 4);
}

export default function App() {
  const [state, setState] = useState<GameState>(createInitialState());
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [validationWorker, setValidationWorker] = useState<Worker | null>(null);
  const [inputSeed, setInputSeed] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('DEFAULT');
  const [newSpeciesForm, setNewSpeciesForm] = useState({ 
    name: '', emoji: '🦖', diet: Diet.HERBIVORE, preferredTerrain: Terrain.GRASS,
    maxAge: 300, maxEnergy: 120, energyCost: 1.2, reproduceThreshold: 90, visionRange: 5, visionAngle: 360,
    maxHealth: 50, strength: 5, speed: 1.0, efficiency: 1.0, intelligence: 5, movementType: 'WALK' as MovementType,
    personality: { fear: 0.5, hunger: 0.5, libido: 0.5, aggression: 0.5, social: 0.5 }
  });

  // Simulation Loop
  useEffect(() => {
    let timer: number;
    if (state.status === 'SIMULATING') {
      timer = window.setInterval(() => {
        setState(prev => {
          if (prev.tick >= TICKS_PER_ERA) {
            clearInterval(timer);
            return { ...prev, status: 'ERA_SUMMARY', isGeneratingSummary: true };
          }
          return tickSimulation(prev);
        });
      }, 200);
    }
    return () => clearInterval(timer);
  }, [state.status]);

  // Gemini Summary Trigger
  useEffect(() => {
    if (state.status === 'ERA_SUMMARY' && state.isGeneratingSummary) {
      const endStats: Record<string, number> = {};
      state.entities.forEach(e => {
        const name = state.unlockedSpecies[e.speciesId]?.name || e.speciesId;
        endStats[name] = (endStats[name] || 0) + 1;
      });

      generateEraSummary(state.era, state.lastActionDescription, state.eraStartStats, endStats)
        .then(summary => {
          setState(prev => ({ ...prev, eraSummary: summary, isGeneratingSummary: false }));
        });
    }
  }, [state.status, state.isGeneratingSummary]);

  const handleStart = () => {
    setTestResults(null);
    setState(prev => ({
      ...createInitialState(),
      status: 'DRAFTING',
      draftOptions: generateDraftOptions(prev.unlockedSpecies, [], prev.entities)
    }));
  };

  const handleRunValidation = () => {
    setIsRunningTests(true);
    setValidationProgress(0);
    setTestResults(null);

    const worker = new Worker(new URL('./validationWorker.ts', import.meta.url), { type: 'module' });
    setValidationWorker(worker);

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'PROGRESS') {
        setValidationProgress(payload.progress);
      } else if (type === 'COMPLETE') {
        setTestResults([{ name: 'Full Cycle Test', ...payload, success: true }]);
        setIsRunningTests(false);
        worker.terminate();
        setValidationWorker(null);
      } else if (type === 'ERROR') {
        setTestResults([{ name: 'Error', message: payload.message, success: false }]);
        setIsRunningTests(false);
        worker.terminate();
        setValidationWorker(null);
      }
    };

    worker.postMessage({ 
      type: 'RUN_VALIDATION', 
      payload: { 
        seed: inputSeed ? parseInt(inputSeed) : Math.floor(Math.random() * 1000000), 
        preset: selectedPreset, 
        totalTicks: 1000 
      } 
    });
  };

  const handleCancelValidation = () => {
    if (validationWorker) {
      validationWorker.terminate();
      setValidationWorker(null);
    }
    setIsRunningTests(false);
    setValidationProgress(0);
  };

  const handleResetWorld = () => {
    const seed = inputSeed ? parseInt(inputSeed) : Math.floor(Math.random() * 1000000);
    setState(createInitialState(seed, selectedPreset));
  };

  const handleDraft = (option: DraftOption) => {
    if (option.type === 'CREATE_SPECIES') {
      setState(prev => ({
        ...prev,
        status: 'CREATING_SPECIES',
        selectedDraft: option
      }));
    } else if (option.type === 'ECO_EVENT') {
      const eventData = ECO_EVENTS[option.data.eventId];
      setState(prev => ({
        ...prev,
        status: 'SIMULATING',
        activeEvents: [...prev.activeEvents, { ...eventData, duration: TICKS_PER_ERA }],
        lastActionDescription: `The gods triggered ${option.title}.`,
        tick: 0
      }));
    } else if (option.type === 'WORLD_LAW') {
      const lawData = WORLD_LAWS[option.data.lawId];
      setState(prev => ({
        ...prev,
        status: 'SIMULATING',
        activeLaws: [...prev.activeLaws, lawData],
        lastActionDescription: `The gods decreed the law of ${option.title}.`,
        tick: 0
      }));
    } else if (option.type === 'DISASTER') {
      // Disasters and Powers apply immediately to the whole era
      setState(prev => {
        const startStats = prev.entities.reduce((acc, e) => {
          const name = prev.unlockedSpecies[e.speciesId]?.name || e.speciesId;
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return {
          ...prev,
          status: 'SIMULATING',
          weather: option.data.weather || Weather.NORMAL,
          weatherDuration: option.data.weather ? TICKS_PER_ERA : 0,
          divinePower: option.data.power,
          divinePowerDuration: option.data.power ? TICKS_PER_ERA : 0,
          lastActionDescription: `The gods brought forth ${option.title}.`,
          eraStartStats: startStats,
          tick: 0
        };
      });
    } else {
      setState(prev => ({
        ...prev,
        status: 'PLACING',
        selectedDraft: option
      }));
    }
  };

  const handleCreateSpecies = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpeciesForm.name || !newSpeciesForm.emoji) return;
    
    const points = calculateGeneticPoints(newSpeciesForm);
    if (points > MAX_GENETIC_POINTS) {
      alert(`Genetic complexity too high! Maximum points allowed: ${MAX_GENETIC_POINTS}`);
      return;
    }

    const newId = `custom_${generateId()}`;
    const newSpecies: Species = {
      id: newId,
      name: newSpeciesForm.name,
      emoji: newSpeciesForm.emoji,
      diet: newSpeciesForm.diet,
      color: '#ffffff', // Custom species are white for now
      visionRange: newSpeciesForm.visionRange,
      visionAngle: newSpeciesForm.visionAngle,
      maxHealth: newSpeciesForm.maxHealth,
      strength: newSpeciesForm.strength,
      speed: newSpeciesForm.speed,
      efficiency: newSpeciesForm.efficiency,
      intelligence: newSpeciesForm.intelligence,
      maxAge: newSpeciesForm.maxAge,
      maxEnergy: newSpeciesForm.maxEnergy,
      energyCost: newSpeciesForm.energyCost,
      foodValue: Math.floor(newSpeciesForm.maxEnergy * 0.4),
      reproduceThreshold: newSpeciesForm.reproduceThreshold,
      preferredTerrain: [newSpeciesForm.preferredTerrain],
      movementTypes: [newSpeciesForm.movementType],
      personality: newSpeciesForm.personality
    };

    setState(prev => ({
      ...prev,
      status: 'PLACING',
      unlockedSpecies: { ...prev.unlockedSpecies, [newId]: newSpecies },
      selectedDraft: {
        id: `unlock_${newId}`,
        title: `Introduce ${newSpecies.name}`,
        description: `Add ${newSpecies.name} to the ecosystem. Diet: ${newSpecies.diet}`,
        type: 'SPECIES',
        data: { speciesId: newId },
        emoji: newSpecies.emoji
      }
    }));
  };

  const handleCellClick = (x: number, y: number) => {
    if (state.status === 'SIMULATING') {
      const entityAt = state.entities.find(e => e.x === x && e.y === y);
      setState(prev => ({
        ...prev,
        selectedEntityId: prev.selectedEntityId === entityAt?.id ? null : (entityAt?.id || null)
      }));
      return;
    }
    if (state.status !== 'PLACING' || !state.selectedDraft) return;

    let newEntities = [...state.entities];
    let newGrid = state.grid.map(row => [...row]);
    let actionDesc = '';

    if (state.selectedDraft.type === 'SPECIES') {
      const speciesId = state.selectedDraft.data.speciesId;
      const species = BASE_SPECIES[speciesId] || state.unlockedSpecies[speciesId];
      
      if (!species) {
        console.error(`Species not found for ID: ${speciesId}`);
        return;
      }
      
      // Add a cluster - Reduced from 3 to 2 for better balance
      for (let i = 0; i < 2; i++) {
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        const nx = Math.max(0, Math.min(GRID_SIZE - 1, x + dx));
        const ny = Math.max(0, Math.min(GRID_SIZE - 1, y + dy));
        newEntities.push({
          id: generateId(), speciesId, x: nx, y: ny, age: 0, energy: species.maxEnergy, health: species.maxHealth, facing: {x:0, y:0}, state: 'IDLE', mutation: 'NONE'
        });
      }
      actionDesc = state.selectedDraft.data.isNew ? `The gods discovered ${species.name} at (${x}, ${y}).` : `The gods spawned more ${species.name} at (${x}, ${y}).`;
    } else if (state.selectedDraft.type === 'TERRAIN') {
      const terrain = state.selectedDraft.data.terrain;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= 3) { // Diamond shape
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
              newGrid[ny][nx] = { ...newGrid[ny][nx], terrain };
            }
          }
        }
      }
      actionDesc = `Created a new ${terrain} biome.`;
    }

    // Calculate start stats
    const startStats: Record<string, number> = {};
    newEntities.forEach(e => {
      const name = state.unlockedSpecies[e.speciesId]?.name || BASE_SPECIES[e.speciesId]?.name || e.speciesId;
      startStats[name] = (startStats[name] || 0) + 1;
    });

    setState(prev => ({
      ...prev,
      status: 'SIMULATING',
      grid: newGrid,
      entities: newEntities,
      lastActionDescription: actionDesc,
      eraStartStats: startStats,
      tick: 0,
      unlockedSpecies: state.selectedDraft!.type === 'SPECIES' 
        ? { 
            ...prev.unlockedSpecies, 
            [state.selectedDraft!.data.speciesId]: prev.unlockedSpecies[state.selectedDraft!.data.speciesId] || BASE_SPECIES[state.selectedDraft!.data.speciesId] 
          }
        : prev.unlockedSpecies
    }));
  };

  const handleNextEra = () => {
    setState(prev => {
      if (prev.entities.length === 0 && prev.era >= 3) {
        return { ...prev, status: 'GAME_OVER' };
      }
      
      const evolvedSpecies: Record<string, Species> = {};
      Object.entries(prev.unlockedSpecies).forEach(([id, species]) => {
        evolvedSpecies[id] = evolveSpecies(species as Species);
      });

      return {
        ...prev,
        status: 'DRAFTING',
        era: prev.era + 1,
        unlockedSpecies: evolvedSpecies,
        draftOptions: generateDraftOptions(evolvedSpecies, prev.alerts, prev.entities)
      };
    });
  };

  if (state.status === 'MENU') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center font-sans select-none relative overflow-hidden">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity"
          style={{ backgroundImage: 'url("https://ais-dev-f2xjqpdvv5542kvzhc5qgz-204365806891.us-east1.run.app/api/files/64804adf-f223-4247-86d1-1d28b6cebbe0/input_file_0.png")' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/20 via-zinc-950/60 to-zinc-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,_rgba(16,185,129,0.15)_0%,_transparent_70%)]" />
        <div className="scanline" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }} 
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center max-w-2xl z-10"
        >
          <h1 className="text-9xl font-display font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-b from-emerald-300 via-emerald-500 to-emerald-900 drop-shadow-[0_0_30px_rgba(16,185,129,0.3)]">
            ECO-GOD
          </h1>
          <div className="h-px w-32 bg-emerald-500/50 mx-auto mb-8" />
          <p className="text-zinc-400 mb-12 text-xl font-light tracking-wide max-w-lg mx-auto leading-relaxed">
            Shape the land. Seed life. Watch the ecosystem adapt to your <span className="text-emerald-400 font-medium">divine interventions</span>.
          </p>
          
          <div className="flex flex-col gap-4 max-w-xs mx-auto">
            <button 
              onClick={handleStart} 
              className="group relative flex items-center justify-center w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-xl transition-all shadow-[0_0_40px_rgba(16,185,129,0.2)] hover:shadow-[0_0_60px_rgba(16,185,129,0.4)] hover:-translate-y-1 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <Play className="mr-3 fill-current" /> Create World
            </button>
            <p className="text-[10px] text-zinc-600 uppercase tracking-[0.3em] font-bold">Version 2.0 • Simulation Engine Alpha</p>
          </div>
        </motion.div>
        
        {/* Decorative elements */}
        <div className="absolute bottom-10 left-10 text-zinc-800 font-mono text-[10px] space-y-1">
          <div>SYSTEM_READY: TRUE</div>
          <div>BIOME_ENGINE: ACTIVE</div>
          <div>GENETIC_DRIFT: ENABLED</div>
        </div>
      </div>
    );
  }

  if (state.status === 'GAME_OVER') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center font-sans relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(239,68,68,0.1)_0%,_transparent_70%)]" />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }} 
          className="text-center max-w-lg p-12 glass-dark rounded-[3rem] border-red-500/20 shadow-[0_0_100px_rgba(239,68,68,0.1)] z-10"
        >
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-red-500/30">
            <RotateCcw className="text-red-500" size={40} />
          </div>
          <h1 className="text-6xl font-display font-black tracking-tighter mb-4 text-red-500">WORLD COLLAPSED</h1>
          <p className="text-zinc-400 mb-8 text-lg font-light leading-relaxed">Your world has become barren. The delicate balance of life was lost to the void.</p>
          
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Time Elapsed</div>
              <div className="text-2xl font-display font-bold text-white">{state.era} Eras</div>
            </div>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Final Status</div>
              <div className="text-2xl font-display font-bold text-red-400">Extinct</div>
            </div>
          </div>

          <button 
            onClick={handleStart} 
            className="flex items-center justify-center w-full py-5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-2xl font-bold text-xl transition-all shadow-xl hover:-translate-y-1 active:scale-95"
          >
            <RotateCcw className="mr-2" /> Start Anew
          </button>
        </motion.div>
      </div>
    );
  }

  if (state.status === 'DRAFTING') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center font-sans p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(16,185,129,0.1)_0%,_transparent_50%)]" />
        
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16 z-10"
        >
          <div className="inline-block px-4 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[10px] font-bold uppercase tracking-[0.3em] mb-4">
            Divine Selection Phase
          </div>
          <h2 className="text-6xl font-display font-black mb-4 text-white tracking-tight">Era {state.era} Begins</h2>
          <p className="text-zinc-400 text-xl font-light max-w-xl mx-auto">Choose one divine intervention to shape the future of your ecosystem.</p>
        </motion.div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full px-4 z-10">
          {state.draftOptions.map((option, i) => {
            return (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -8, scale: 1.02 }}
                onClick={() => handleDraft(option)}
                className="group w-full h-[400px] glass-dark rounded-[2.5rem] p-6 flex flex-col items-center text-center cursor-pointer transition-all hover:border-emerald-500/40 hover:shadow-[0_20px_60px_rgba(16,185,129,0.15)] relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-5xl mb-8 group-hover:scale-110 transition-transform duration-500 shadow-inner">
                  {option.emoji}
                </div>
                
                <h3 className="text-2xl font-display font-bold mb-3 text-white group-hover:text-emerald-300 transition-colors">{option.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed font-light mb-4 flex-1">{option.description}</p>
                
                {option.downside && (
                  <div className="w-full p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-400 font-bold uppercase tracking-wider mb-4">
                    Downside: {option.downside}
                  </div>
                )}

                <div className={`w-full py-4 rounded-2xl border border-white/5 transition-all font-bold text-sm uppercase tracking-widest ${
                  option.rarity === 'LEGENDARY' ? 'bg-amber-500 text-black' :
                  option.rarity === 'RARE' ? 'bg-purple-600 text-white' :
                  'bg-white/5 group-hover:bg-emerald-600 group-hover:text-white'
                }`}>
                  Manifest
                </div>
                
                <div className={`absolute top-4 right-4 text-[10px] font-mono font-bold uppercase ${
                  option.rarity === 'LEGENDARY' ? 'text-amber-500' :
                  option.rarity === 'RARE' ? 'text-purple-400' :
                  'text-zinc-700'
                }`}>
                  {option.rarity} {option.type}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  if (state.status === 'CREATING_SPECIES') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center font-sans p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(16,185,129,0.1)_0%,_transparent_50%)]" />
        <div className="scanline" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="glass-dark p-12 rounded-[3rem] border-white/10 w-full max-w-4xl shadow-2xl z-10 relative overflow-y-auto max-h-[90vh] custom-scrollbar"
        >
          <div className="flex items-center justify-between mb-12 border-b border-white/5 pb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center border border-emerald-500/30">
                <Settings2 className="text-emerald-400" size={24} />
              </div>
              <div>
                <h2 className="text-4xl font-display font-black text-white tracking-tight">Divine Laboratory</h2>
                <div className="flex items-center gap-4 mt-1">
                  <p className="text-zinc-500 text-sm uppercase tracking-widest font-bold">Genetic Engineering Phase</p>
                  <div className="h-1 w-1 bg-zinc-700 rounded-full" />
                  <p className={`text-sm font-bold uppercase tracking-widest ${calculateGeneticPoints(newSpeciesForm) > MAX_GENETIC_POINTS ? 'text-red-500' : 'text-emerald-400'}`}>
                    Complexity: {calculateGeneticPoints(newSpeciesForm)} / {MAX_GENETIC_POINTS}
                  </p>
                </div>
              </div>
            </div>
            <div className="text-6xl animate-float">{newSpeciesForm.emoji}</div>
          </div>
          
          <form onSubmit={handleCreateSpecies} className="space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Basic Info */}
              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 ml-1">Species Designation</label>
                  <input 
                    type="text" 
                    required
                    value={newSpeciesForm.name}
                    onChange={e => setNewSpeciesForm({...newSpeciesForm, name: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all font-medium placeholder:text-zinc-700"
                    placeholder="Enter name..."
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 ml-1">Dietary Path</label>
                    <select 
                      value={newSpeciesForm.diet}
                      onChange={e => setNewSpeciesForm({...newSpeciesForm, diet: e.target.value as Diet})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:border-emerald-500 outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value={Diet.HERBIVORE}>Herbivore</option>
                      <option value={Diet.CARNIVORE}>Carnivore</option>
                      <option value={Diet.SCAVENGER}>Scavenger</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 ml-1">Locomotion</label>
                    <select 
                      value={newSpeciesForm.movementType}
                      onChange={e => setNewSpeciesForm({...newSpeciesForm, movementType: e.target.value as MovementType})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:border-emerald-500 outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="WALK">Walk</option>
                      <option value="SWIM">Swim</option>
                      <option value="FLY">Fly</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 ml-1">Preferred Environment</label>
                  <select 
                    value={newSpeciesForm.preferredTerrain}
                    onChange={e => setNewSpeciesForm({...newSpeciesForm, preferredTerrain: e.target.value as Terrain})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:border-emerald-500 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value={Terrain.GRASS}>Grasslands</option>
                    <option value={Terrain.FOREST}>Ancient Forest</option>
                    <option value={Terrain.WATER}>Deep Water</option>
                    <option value={Terrain.DIRT}>Barren Dirt</option>
                    <option value={Terrain.MOUNTAIN}>High Mountains</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 ml-1">Visual Avatar</label>
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 grid grid-cols-6 gap-2 h-40 overflow-y-auto custom-scrollbar">
                    {EMOJI_LIST.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewSpeciesForm({...newSpeciesForm, emoji})}
                        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${newSpeciesForm.emoji === emoji ? 'bg-emerald-500 text-white scale-110 shadow-lg' : 'bg-white/5 hover:bg-white/10 text-zinc-400'}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-6 bg-white/5 p-8 rounded-[2rem] border border-white/5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-6 flex items-center gap-2">
                  <Zap size={14} className="text-emerald-400" /> Biological Parameters
                </h3>
                
                {[
                  { label: 'Intelligence', key: 'intelligence', min: 1, max: 10, icon: <Settings2 size={12} /> },
                  { label: 'Max Age', key: 'maxAge', min: 100, max: 1000, step: 50, icon: <RotateCcw size={12} /> },
                  { label: 'Max Energy', key: 'maxEnergy', min: 50, max: 500, step: 10, icon: <Zap size={12} /> },
                  { label: 'Energy Cost', key: 'energyCost', min: 0.1, max: 5, step: 0.1, icon: <Droplet size={12} /> },
                  { label: 'Reproduction', key: 'reproduceThreshold', min: 30, max: 400, step: 10, icon: <Heart size={12} /> },
                  { label: 'Vision Range', key: 'visionRange', min: 1, max: 10, step: 1, icon: <Info size={12} /> },
                  { label: 'Speed', key: 'speed', min: 0.5, max: 2.0, step: 0.1, icon: <Zap size={12} /> },
                  { label: 'Max Health', key: 'maxHealth', min: 10, max: 200, step: 10, icon: <Heart size={12} /> },
                  { label: 'Strength', key: 'strength', min: 1, max: 50, step: 1, icon: <Zap size={12} /> }
                ].map(stat => (
                  <div key={stat.key} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                        {stat.icon} {stat.label}
                      </label>
                      <span className="text-xs font-mono font-bold text-emerald-400">{(newSpeciesForm as any)[stat.key]}</span>
                    </div>
                    <input 
                      type="range" 
                      min={stat.min} 
                      max={stat.max} 
                      step={stat.step || 1}
                      value={(newSpeciesForm as any)[stat.key]}
                      onChange={e => {
                        const val = stat.step && stat.step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value);
                        setNewSpeciesForm({...newSpeciesForm, [stat.key]: val});
                      }}
                      className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                ))}

                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mt-8 mb-6 flex items-center gap-2">
                  <Settings2 size={14} className="text-emerald-400" /> Behavioral Matrix
                </h3>

                {[
                  { label: 'Fear (Skittishness)', key: 'fear' },
                  { label: 'Hunger (Drive)', key: 'hunger' },
                  { label: 'Libido (Reproduction)', key: 'libido' },
                  { label: 'Aggression (Territorial)', key: 'aggression' },
                  { label: 'Social (Herding)', key: 'social' }
                ].map(p => (
                  <div key={p.key} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{p.label}</label>
                      <span className="text-xs font-mono font-bold text-emerald-400">{(newSpeciesForm.personality as any)[p.key]}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.1"
                      value={(newSpeciesForm.personality as any)[p.key]}
                      onChange={e => setNewSpeciesForm({
                        ...newSpeciesForm, 
                        personality: { ...newSpeciesForm.personality, [p.key]: parseFloat(e.target.value) }
                      })}
                      className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-6 pt-10 border-t border-white/5">
              <button 
                type="button"
                onClick={() => setState(prev => ({ ...prev, status: 'DRAFTING' }))}
                className="flex-1 py-5 bg-zinc-800/50 hover:bg-zinc-800 text-white rounded-2xl font-bold transition-all border border-white/5"
              >
                Abort Experiment
              </button>
              <button 
                type="submit"
                disabled={calculateGeneticPoints(newSpeciesForm) > MAX_GENETIC_POINTS}
                className="flex-[2] py-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white rounded-2xl font-bold transition-all shadow-lg shadow-emerald-900/20 hover:-translate-y-1 active:scale-95"
              >
                Manifest Species
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  if (state.status === 'ERA_SUMMARY') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center font-sans p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(16,185,129,0.1)_0%,_transparent_50%)]" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="glass-dark p-12 rounded-[3rem] border-white/10 w-full max-w-4xl shadow-2xl z-10 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Info size={120} className="text-emerald-500" />
          </div>

          <div className="flex items-center gap-4 mb-12">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center border border-emerald-500/30">
              <FastForward className="text-emerald-400" size={32} />
            </div>
            <div>
              <h2 className="text-5xl font-display font-black text-white tracking-tight">Era {state.era} Concluded</h2>
              <p className="text-zinc-500 text-sm uppercase tracking-widest font-bold">Divine Observation Report</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                <Info size={14} /> Chronological Summary
              </h3>
              {state.isGeneratingSummary ? (
                <div className="flex flex-col items-center py-20 bg-white/5 rounded-[2rem] border border-white/5">
                  <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                  <p className="text-zinc-400 animate-pulse font-medium uppercase tracking-widest text-[10px]">Processing Divine Data...</p>
                </div>
              ) : (
                <div className="space-y-8">
                  <p className="text-xl text-zinc-200 leading-relaxed font-light italic">"{state.eraSummary}"</p>
                  
                  <div className="pt-8 border-t border-white/5 flex justify-end">
                    <button 
                      onClick={handleNextEra}
                      className="group relative px-10 py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold transition-all flex items-center shadow-lg hover:shadow-emerald-500/25 hover:-translate-y-1 overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                      Begin Next Era <FastForward className="ml-3" size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
                <Zap size={14} /> Evolutionary Progress
              </h3>
              <div className="bg-white/5 rounded-[2rem] p-6 border border-white/5 space-y-4">
                {Object.values(state.unlockedSpecies).slice(0, 4).map((s: Species) => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{s.emoji}</span>
                      <span className="text-sm font-bold text-zinc-300">{s.name}</span>
                    </div>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md font-bold">
                      GEN {s.generation || 1}
                    </span>
                  </div>
                ))}
                <p className="text-[10px] text-zinc-600 text-center uppercase tracking-widest pt-2">All species evolved +10% stats</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // PLACING or SIMULATING
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans overflow-hidden select-none relative">
      <div className="vignette" />
      <div className="scanline" />
      
      {/* Validation Progress Modal */}
      {isRunningTests && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-10">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900 border border-white/10 rounded-[3rem] p-12 max-w-xl w-full shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
              <motion.div 
                className="h-full bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                initial={{ width: 0 }}
                animate={{ width: `${validationProgress}%` }}
              />
            </div>

            <div className="flex flex-col items-center text-center gap-8">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30 animate-pulse">
                <ShieldCheck className="text-emerald-400" size={40} />
              </div>
              
              <div>
                <h2 className="text-3xl font-display font-black text-white mb-2 uppercase tracking-tight">Running System Audit</h2>
                <p className="text-zinc-400 text-sm">Validating predator AI cycles, map stability, and ecological balance across 1000 ticks.</p>
              </div>

              <div className="w-full bg-zinc-800/50 rounded-2xl p-6 border border-white/5">
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-2">
                  <span>Simulation Progress</span>
                  <span>{Math.round(validationProgress)}%</span>
                </div>
                <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-emerald-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${validationProgress}%` }}
                  />
                </div>
              </div>

              <button 
                onClick={handleCancelValidation}
                className="px-8 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl hover:bg-red-500/20 transition-all font-bold uppercase tracking-widest text-xs"
              >
                Abort Audit
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Header - Command Center Style */}
      <header className="flex justify-between items-center px-8 py-6 bg-zinc-900/40 backdrop-blur-2xl border-b border-white/5 z-30 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent" />
        
        <div className="relative flex items-center gap-6">
          <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <Settings2 className="text-emerald-400" size={24} />
          </div>
          <div>
            <h2 className="text-4xl font-display font-black text-white tracking-tighter leading-none mb-1">ECO-GOD</h2>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-zinc-500 font-bold tracking-[0.2em] uppercase">Era {state.era} // System Active</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-12 relative">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">Cycle</span>
            <div className="flex items-center text-white font-mono text-xl bg-white/5 px-4 py-1 rounded-lg border border-white/10">
              {state.timeOfDay === TimeOfDay.DAY ? '☀️ DAY' : '🌙 NIGHT'}
              <span className="ml-2 text-xs text-zinc-500">({state.timeUntilNextCycle})</span>
            </div>
          </div>

          {state.activeEvents.length > 0 && (
             <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
               <span className="text-[10px] text-amber-500 uppercase tracking-[0.2em] font-bold mb-1">Active Events</span>
               <div className="flex items-center text-amber-400 font-mono text-xl bg-amber-500/10 px-4 py-1 rounded-lg border border-amber-500/20">
                 ⚡ {state.activeEvents.length} Active
               </div>
             </motion.div>
          )}
          
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">World Config</span>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-lg border border-white/10">
              <input 
                type="text" 
                placeholder="Seed"
                value={inputSeed}
                onChange={(e) => setInputSeed(e.target.value)}
                className="w-16 bg-transparent text-[10px] font-mono focus:outline-none text-emerald-400 placeholder:text-zinc-700"
              />
              <select 
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value)}
                className="bg-transparent text-[10px] font-mono focus:outline-none text-emerald-400 cursor-pointer"
              >
                <option value="DEFAULT" className="bg-zinc-900 text-white">Default</option>
                <option value="WOLF_CHASE" className="bg-zinc-900 text-white">Wolf Chase</option>
              </select>
              <button 
                onClick={handleResetWorld}
                className="text-[10px] text-zinc-500 hover:text-white transition-colors"
                title="Reset World"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">Validation</span>
            <button 
              onClick={handleRunValidation}
              disabled={isRunningTests}
              className="flex items-center text-emerald-400 font-mono text-[10px] bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
            >
              <ShieldCheck size={12} className="mr-1" /> {isRunningTests ? 'Testing...' : 'Audit'}
            </button>
          </div>
              
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">Engine Status</span>
            <div className={`flex items-center font-mono text-xl px-4 py-1 rounded-lg border ${state.status === 'PLACING' ? 'text-amber-400 border-amber-500/20 bg-amber-500/5 animate-pulse' : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'}`}>
              {state.status === 'PLACING' ? 'Awaiting Command' : `Simulating ${Math.floor((state.tick / TICKS_PER_ERA) * 100)}%`}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-row items-stretch justify-center p-10 gap-10 relative bg-zinc-950 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.03)_0%,_transparent_70%)]" />
        
        {/* Main Map Area */}
        <div className="flex flex-col items-center justify-center flex-1 z-10">
          {state.status === 'PLACING' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 glass-dark text-amber-400 px-10 py-5 rounded-[2rem] border-amber-500/30 font-bold shadow-[0_20px_50px_rgba(245,158,11,0.1)] flex items-center gap-4 backdrop-blur-2xl"
            >
              <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center text-3xl shadow-inner">
                {state.selectedDraft?.emoji}
              </div>
              <div className="flex flex-col">
                <span className="text-xs uppercase tracking-widest text-amber-500/60">Deployment Active</span>
                <span className="text-lg">Manifesting {state.selectedDraft?.title}</span>
              </div>
              <div className="ml-4 px-3 py-1 bg-amber-500/10 rounded-lg text-[10px] border border-amber-500/20 animate-pulse">
                CLICK MAP TO PLACE
              </div>
            </motion.div>
          )}

          <div className="relative w-[640px] h-[640px] bg-zinc-900 rounded-[3rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)] ring-1 ring-white/10 select-none cursor-crosshair group">
            {/* Map Grid Background */}
            <div className="absolute inset-0 opacity-20 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle, #333 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            
            {/* Weather Overlay */}
            {state.weather !== Weather.NORMAL && (
               <div 
                 className="absolute inset-0 pointer-events-none z-20 transition-colors duration-1000 mix-blend-overlay"
                 style={{ backgroundColor: WEATHER_COLORS[state.weather] }}
               />
            )}

            {/* Power Overlay */}
            {state.divinePower && (
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 className="absolute inset-0 pointer-events-none z-20"
                 style={{ 
                   backgroundColor: state.divinePower === 'power_bloom' ? 'rgba(16, 185, 129, 0.05)' : 
                                    state.divinePower === 'power_mutation' ? 'rgba(168, 85, 247, 0.05)' : 
                                    'rgba(239, 68, 68, 0.05)' 
                 }}
               >
                 {state.divinePower === 'power_bloom' && (
                   <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.2)_0%,_transparent_70%)] animate-pulse" />
                 )}
                 {state.divinePower === 'power_mutation' && (
                   <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #a855f7 0, #a855f7 1px, transparent 0, transparent 50%)', backgroundSize: '10px 10px' }} />
                 )}
                 {state.divinePower === 'power_meteor' && (
                   <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(239,68,68,0.1)_0%,_transparent_70%)] animate-pulse" />
                 )}
               </motion.div>
            )}

          {/* Render Grid */}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)` }}>
            {state.grid.map((row, y) => row.map((cell, x) => {
              const plantType = cell.plantType ? PLANT_TYPES[cell.plantType] : null;
              const risk = cell.riskValue || 0;
              
              return (
                <div 
                  key={`${x}-${y}`}
                  onClick={() => handleCellClick(x, y)}
                  className={`relative w-full h-full border-[0.5px] border-black/5 transition-colors duration-500 cursor-pointer`}
                  style={{ 
                    backgroundColor: TERRAIN_COLORS[cell.terrain],
                    boxShadow: risk > 0.1 ? `inset 0 0 ${risk * 10}px rgba(239,68,68,${risk * 0.5})` : 'none'
                  }}
                >
                  {/* Plant Rendering */}
                  {plantType && (
                    <div 
                      className="absolute inset-0 flex items-center justify-center transition-all duration-700"
                      style={{ 
                        opacity: (cell.plantEnergy || 0) / 100,
                        transform: `scale(${0.5 + (cell.plantEnergy || 0) / 200})`
                      }}
                    >
                      {cell.plantType === 'berry_bush' && (cell.plantEnergy || 0) > 50 ? (
                        <div className="relative">
                          <TreePine className="text-emerald-900/40" size={12} />
                          <div className="absolute -top-1 -right-1 flex gap-0.5">
                             <div className="w-1 h-1 bg-red-500 rounded-full shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
                             <div className="w-1 h-1 bg-red-500 rounded-full shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
                          </div>
                        </div>
                      ) : (
                        <TreePine className="text-emerald-900/40" size={12} />
                      )}
                    </div>
                  )}
                </div>
              );
            }))}
          </div>

          {/* Entities Layer - Overlay for smooth movement */}
          <div className="absolute inset-0 pointer-events-none z-30">
            {state.entities.map(e => {
              const species = state.unlockedSpecies[e.speciesId] || BASE_SPECIES[e.speciesId];
              if (!species) return null;
              
              return (
                <motion.div
                  key={e.id}
                  layoutId={e.id}
                  className="absolute flex items-center justify-center text-xs"
                  style={{ 
                    width: `${100 / GRID_SIZE}%`,
                    height: `${100 / GRID_SIZE}%`,
                    left: `${e.x * (100 / GRID_SIZE)}%`,
                    top: `${e.y * (100 / GRID_SIZE)}%`,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  animate={{ 
                    scale: e.state === 'MATING' ? 1.4 : 1,
                    rotate: (e.facing?.x || 0) * 45 + (e.facing?.y || 0) * 90
                  }}
                >
                  <span className={`drop-shadow-md transition-all duration-300 ${state.selectedEntityId === e.id ? 'scale-150 brightness-125' : ''}`}>{species.emoji}</span>
                  {e.outbreakActive && <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />}
                  
                  {/* Status Balloon */}
                  {state.selectedEntityId === e.id && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className="absolute -top-32 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
                    >
                      <div className="glass-dark border-white/20 rounded-2xl p-3 shadow-2xl min-w-[140px] backdrop-blur-xl">
                        <div className="flex items-center gap-2 mb-2 border-b border-white/10 pb-2">
                          <span className="text-lg">{species.emoji}</span>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">{species.name}</span>
                            <span className="text-[8px] text-emerald-400 font-mono uppercase">{e.state}</span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-[8px] uppercase tracking-tighter text-zinc-400">
                            <span>Health</span>
                            <span className="text-white font-mono">{Math.round(e.health)}/{species.maxHealth}</span>
                          </div>
                          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${(e.health / species.maxHealth) * 100}%` }} />
                          </div>
                          
                          <div className="flex justify-between items-center text-[8px] uppercase tracking-tighter text-zinc-400">
                            <span>Energy</span>
                            <span className="text-white font-mono">{Math.round(e.energy)}/{species.maxEnergy}</span>
                          </div>
                          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${(e.energy / species.maxEnergy) * 100}%` }} />
                          </div>

                          <div className="flex justify-between items-center text-[8px] uppercase tracking-tighter text-zinc-400">
                            <span>Fome</span>
                            <span className="text-white font-mono">{Math.round((1 - e.energy / species.maxEnergy) * 100)}%</span>
                          </div>
                          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-600 transition-all duration-500" style={{ width: `${(1 - e.energy / species.maxEnergy) * 100}%` }} />
                          </div>

                          {e.mateCooldownTicks && e.mateCooldownTicks > 0 ? (
                            <div className="flex justify-between items-center text-[8px] uppercase tracking-tighter text-zinc-400">
                              <span>Cooldown</span>
                              <span className="text-blue-400 font-mono">{e.mateCooldownTicks}t</span>
                            </div>
                          ) : null}

                          {e.pregnantTicks && e.pregnantTicks > 0 ? (
                            <div className="flex justify-between items-center text-[8px] uppercase tracking-tighter text-zinc-400">
                              <span>Gestação</span>
                              <span className="text-pink-400 font-mono">{e.pregnantTicks}t</span>
                            </div>
                          ) : null}

                          <div className="flex justify-between items-center text-[8px] uppercase tracking-tighter text-zinc-400 mt-1">
                            <span>Age</span>
                            <span className="text-white font-mono">{e.age} / {species.maxAge}</span>
                          </div>
                        </div>
                        {/* Arrow */}
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-900/90 border-r border-b border-white/10 rotate-45" />
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
          
      {/* Dashboard Panel - Command Center Sidebar */}
      <div className="w-[480px] flex flex-col gap-8 h-[640px] z-10">
          
          {/* Population Chart */}
          <div className="glass-dark border-white/5 rounded-[2.5rem] p-8 shadow-2xl flex-1 flex flex-col overflow-hidden relative">
            <div className="absolute top-0 right-0 p-6 opacity-5">
              <Zap size={80} className="text-emerald-500" />
            </div>
            
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] mb-6 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Biomass Analytics
                <button 
                  onClick={handleRunValidation}
                  disabled={isRunningTests}
                  className="ml-4 flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg border border-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ShieldCheck size={12} />
                  <span className="text-[8px] font-bold uppercase tracking-widest">
                    {isRunningTests ? 'Validating...' : 'Run Validation'}
                  </span>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end gap-1">
                  {testResults && (
                    <div className="flex flex-col gap-1 mb-2">
                      {testResults.map((r, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                          <span className="text-[8px] text-zinc-400 uppercase">{r.name}</span>
                          <span className={`text-[8px] font-bold ${r.passRate >= 0.8 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {(r.passRate * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                    <span className="text-[8px] text-zinc-500">FRUITFUL BUSHES</span>
                    <span className="text-[10px] font-mono text-red-400">
                      {state.grid.reduce((acc, row) => acc + row.filter(c => c.plantType === 'berry_bush' && (c.plantEnergy || 0) > 40).length, 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                    <span className="text-[8px] text-zinc-500">ECO ENERGY</span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      {Math.round((state.eraMetrics?.energyTotals?.animals || 0) + (state.eraMetrics?.energyTotals?.plants || 0) + (state.eraMetrics?.energyTotals?.carcasses || 0))}
                    </span>
                  </div>
                </div>
              </div>
            </h3>
            
            <div className="flex-1 w-full min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={state.populationHistory.map(h => ({ tick: h.tick, ...h.counts }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis dataKey="tick" hide />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', backdropFilter: 'blur(10px)' }}
                    itemStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                  />
                  {Object.keys(state.unlockedSpecies).map((id, index) => (
                    <Line 
                      key={id} 
                      type="monotone" 
                      dataKey={id} 
                      name={state.unlockedSpecies[id].name}
                      stroke={state.unlockedSpecies[id].color || '#ffffff'} 
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-8 pt-8 border-t border-white/5">
              <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] mb-4">V3.6.1 Metrics</h4>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-white/5 rounded-2xl p-3 border border-white/5 flex flex-col items-center justify-center">
                  <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1 text-center">Rabbit Reserve<br/>Triggered</span>
                  <span className="text-lg font-mono text-amber-400">{state.eraMetrics.rabbitReserveTriggeredCount || 0}</span>
                </div>
                <div className="bg-white/5 rounded-2xl p-3 border border-white/5 flex flex-col items-center justify-center">
                  <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1 text-center">Grass Spread<br/>Conversions</span>
                  <span className="text-lg font-mono text-emerald-400">{state.eraMetrics.grassSpreadConversions || 0}</span>
                </div>
                <div className="bg-white/5 rounded-2xl p-3 border border-white/5 flex flex-col items-center justify-center">
                  <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1 text-center">Rabbit<br/>CanMate | Att | Birth</span>
                  <span className="text-sm font-mono text-pink-400">{state.eraMetrics.rabbitCanMateTicks || 0} | {state.eraMetrics.rabbitMatingAttempts || 0} | {state.eraMetrics.rabbitBirths || 0}</span>
                </div>
                <div className="bg-white/5 rounded-2xl p-3 border border-white/5 flex flex-col items-center justify-center">
                  <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1 text-center">Deer<br/>CanMate | Att | Birth</span>
                  <span className="text-sm font-mono text-pink-400">{state.eraMetrics.deerCanMateTicks || 0} | {state.eraMetrics.deerMatingAttempts || 0} | {state.eraMetrics.deerBirths || 0}</span>
                </div>
              </div>

              <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] mb-4">Active Species Registry</h4>
              <div className="grid grid-cols-2 gap-3 max-h-[180px] overflow-y-auto custom-scrollbar pr-2">
                {Object.values(state.unlockedSpecies).map((species: Species) => {
                  const count = state.entities.filter(e => e.speciesId === species.id).length;
                  if (count === 0 && !state.populationHistory.some(h => (h.counts[species.id] || 0) > 0)) return null;
                  
                  return (
                    <div key={species.id} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-xl group-hover:scale-110 transition-transform">{species.emoji}</span>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-zinc-300">{species.name}</span>
                          <span className="text-[8px] text-zinc-500 uppercase tracking-widest">{species.diet}</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* System Integrity */}
          <div className="glass-dark border-white/5 rounded-[2rem] p-6 shadow-xl flex flex-col gap-4">
             <div className="flex justify-between items-center px-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">System Integrity</span>
                <span className="text-[10px] font-mono text-emerald-500">98.4%</span>
             </div>
             <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '98.4%' }}
                  className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                />
             </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
