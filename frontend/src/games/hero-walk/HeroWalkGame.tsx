import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Command, GameMap, HeroState, Enemy, SimulationResult } from "./types";
import { MAX_COMMANDS, STEP_DELAY_MS, RESULT_DELAY_MS } from "./constants";
import { simulate } from "./engine";
import { generateMap } from "./mapgen";
import Grid from "./Grid";
import CommandPlan from "./CommandPlan";
import CommandButtons from "./CommandButtons";

type GameState = "planning" | "running" | "finished";

export default function HeroWalkGame() {
  const navigate = useNavigate();
  const [map, setMap] = useState<GameMap>(() => generateMap());
  const [plan, setPlan] = useState<Command[]>([]);
  const [gameState, setGameState] = useState<GameState>("planning");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [animatedHero, setAnimatedHero] = useState<HeroState>(() => ({
    pos: { ...map.heroStart },
    dir: map.heroDir,
    treasureCollected: false,
  }));
  const [animatedEnemies, setAnimatedEnemies] = useState<Enemy[]>(() =>
    map.enemies.map((e) => ({ ...e, pos: { ...e.pos } })),
  );
  const [treasureVisible, setTreasureVisible] = useState(true);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetToMap(m: GameMap) {
    setMap(m);
    setPlan([]);
    setGameState("planning");
    setCurrentStepIndex(0);
    setAnimatedHero({
      pos: { ...m.heroStart },
      dir: m.heroDir,
      treasureCollected: false,
    });
    setAnimatedEnemies(m.enemies.map((e) => ({ ...e, pos: { ...e.pos } })));
    setTreasureVisible(true);
    setResult(null);
    if (animRef.current) clearTimeout(animRef.current);
  }

  const addCommand = useCallback((cmd: Command) => {
    setPlan((p) => (p.length < MAX_COMMANDS ? [...p, cmd] : p));
  }, []);

  const removeCommand = useCallback((index: number) => {
    setPlan((p) => p.filter((_, i) => i !== index));
  }, []);

  function handleGo() {
    const sim = simulate(map, plan);
    setResult(sim);
    setGameState("running");
    setCurrentStepIndex(0);

    // Reset animation state to initial
    setAnimatedHero({
      pos: { ...map.heroStart },
      dir: map.heroDir,
      treasureCollected: false,
    });
    setAnimatedEnemies(map.enemies.map((e) => ({ ...e, pos: { ...e.pos } })));
    setTreasureVisible(true);

    // Run step-by-step animation
    let i = 0;
    function nextStep() {
      if (i >= sim.steps.length) {
        animRef.current = setTimeout(() => {
          setGameState("finished");
        }, RESULT_DELAY_MS);
        return;
      }
      const step = sim.steps[i];
      setAnimatedHero({ ...step.hero });
      setCurrentStepIndex(i);

      if (step.enemyKilled) {
        const killed = step.enemyKilled;
        setAnimatedEnemies((prev) =>
          prev.map((e) =>
            e.pos.row === killed.row && e.pos.col === killed.col
              ? { ...e, alive: false }
              : e,
          ),
        );
      }
      if (step.treasurePickedUp) {
        setTreasureVisible(false);
      }

      i++;
      animRef.current = setTimeout(nextStep, STEP_DELAY_MS);
    }
    nextStep();
  }

  function handleRetry() {
    resetToMap(map);
  }

  function handleNewMap() {
    resetToMap(generateMap());
  }

  const isRunning = gameState === "running";
  const isFinished = gameState === "finished";

  return (
    <div className="hw-game">
      <Grid
        map={map}
        heroState={animatedHero}
        enemies={animatedEnemies}
        treasureVisible={treasureVisible}
      />

      {isFinished && result && (
        <div className={`hw-result ${result.outcome === "win" ? "hw-result--win" : "hw-result--lose"}`}>
          <h2>
            {result.outcome === "win"
              ? "Zachr\u00e1nil jsi princeznu!"
              : "Princezna \u010dek\u00e1 d\u00e1l..."}
          </h2>
          {result.outcome === "win" && result.treasureCollected && (
            <p>A sebral poklad!</p>
          )}
          <div className="hw-result-actions">
            <button className="btn btn-primary" onClick={handleRetry}>
              Zkusit znovu
            </button>
            <button className="btn btn-secondary" onClick={handleNewMap}>
              Nov\u00e1 mapa
            </button>
          </div>
        </div>
      )}

      {!isFinished && (
        <>
          <CommandPlan
            plan={plan}
            currentStepIndex={currentStepIndex}
            running={isRunning}
            onRemove={removeCommand}
          />
          <CommandButtons
            onCommand={addCommand}
            onGo={handleGo}
            disabled={isRunning}
            planLength={plan.length}
            maxCommands={MAX_COMMANDS}
          />
        </>
      )}

      <button
        className="btn btn-secondary hw-back"
        onClick={() => navigate("/")}
      >
        Zp\u011bt
      </button>
    </div>
  );
}
