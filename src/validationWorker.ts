import { createInitialState, tickSimulation } from './engine';
import { GameState } from './types';

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'RUN_VALIDATION') {
    const { seed, preset, totalTicks } = payload;
    let state: GameState = createInitialState(seed, preset);
    
    const results = {
      success: true,
      ticksRun: 0,
      finalPop: 0,
      kills: 0,
      errors: [] as string[]
    };

    try {
      for (let i = 0; i < totalTicks; i++) {
        state = tickSimulation(state);
        results.ticksRun++;
        
        if (i % 100 === 0) {
          self.postMessage({ 
            type: 'PROGRESS', 
            payload: { progress: (i / totalTicks) * 100, currentTick: i } 
          });
        }

        // Check for crashes or empty worlds
        if (state.entities.length === 0 && i > 100) {
          // Extinction is not necessarily a failure, but we note it
        }
      }
      
      results.finalPop = state.entities.length;
      results.kills = state.eraMetrics.kills.length;
      
      self.postMessage({ type: 'COMPLETE', payload: results });
    } catch (err: any) {
      self.postMessage({ 
        type: 'ERROR', 
        payload: { message: err.message || 'Unknown error during simulation' } 
      });
    }
  }
};
