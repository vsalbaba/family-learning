import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Command, GameMap, HeroState, Enemy, SimulationResult } from "./types";
import { MAX_COMMANDS, STEP_DELAY_MS, RESULT_DELAY_MS } from "./constants";
import { simulate } from "./engine";
import { generateMap } from "./mapgen";
import { getGameProgress, updateGameProgress } from "../../api/gameProgress";
import { useGameWindow } from "../../hooks/useGameWindow";
import Grid from "./Grid";
import CommandPlan from "./CommandPlan";
import CommandButtons from "./CommandButtons";

type GameState = "planning" | "running" | "finished";

export default function HeroWalkGame() {
  const navigate = useNavigate();
  const { isActive: canReplay } = useGameWindow();
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

  // Animation states
  const [heroBlocked, setHeroBlocked] = useState(false);
  const [treasureCollecting, setTreasureCollecting] = useState(false);
  const [winAnimation, setWinAnimation] = useState(false);

  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const progressSubmittedRef = useRef(false);
  const currentXpRef = useRef(0);

  useEffect(() => {
    getGameProgress("hero-walk").then((p) => { currentXpRef.current = p.xp; }).catch(() => {});
  }, []);

  useEffect(() => {
    if (gameState !== "finished" || !result || progressSubmittedRef.current) return;
    if (result.outcome !== "win") return;
    progressSubmittedRef.current = true;
    const xpDelta = 20 + (result.treasureCollected ? 10 : 0);
    const newXp = currentXpRef.current + xpDelta;
    const level = heroWalkLevel(newXp);
    updateGameProgress("hero-walk", {
      xpDelta,
      dataPatch: {
        lastOutcome: result.outcome,
        treasureCollected: result.treasureCollected,
      },
      summary: {
        level,
        label: `Mapa ${level || 1}`,
        progressText: `${newXp} XP`,
        progressPercent: Math.round(((newXp % 100) / 100) * 100),
      },
    }).catch(() => {});
  }, [gameState, result]);

  function clearAllTimers() {
    if (animRef.current) clearTimeout(animRef.current);
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
  }

  function addTimer(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms);
    timerRefs.current.push(id);
    return id;
  }

  function resetToMap(m: GameMap) {
    clearAllTimers();
    progressSubmittedRef.current = false;
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
    setHeroBlocked(false);
    setTreasureCollecting(false);
    setWinAnimation(false);
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
    setHeroBlocked(false);
    setTreasureCollecting(false);
    setWinAnimation(false);

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
        // Check for win animation
        if (sim.outcome === "win") {
          setWinAnimation(true);
          animRef.current = setTimeout(() => {
            setGameState("finished");
          }, RESULT_DELAY_MS + 600); // extra time for win animation
        } else {
          animRef.current = setTimeout(() => {
            setGameState("finished");
          }, RESULT_DELAY_MS);
        }
        return;
      }
      const step = sim.steps[i];
      setAnimatedHero({ ...step.hero });
      setCurrentStepIndex(i);

      // Blocked animation
      if (step.blocked) {
        setHeroBlocked(true);
        addTimer(() => setHeroBlocked(false), 200);
      }

      // Enemy killed animation
      if (step.enemyKilled) {
        const killed = step.enemyKilled;
        // Phase 1: set dying (triggers CSS animation)
        setAnimatedEnemies((prev) =>
          prev.map((e) =>
            e.pos.row === killed.row && e.pos.col === killed.col
              ? { ...e, dying: true }
              : e,
          ),
        );
        // Phase 2: remove after animation
        addTimer(() => {
          setAnimatedEnemies((prev) =>
            prev.map((e) =>
              e.pos.row === killed.row && e.pos.col === killed.col
                ? { ...e, alive: false, dying: false }
                : e,
            ),
          );
        }, 300);
      }

      // Treasure collect animation
      if (step.treasurePickedUp) {
        setTreasureCollecting(true);
        addTimer(() => {
          setTreasureCollecting(false);
          setTreasureVisible(false);
        }, 300);
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
        heroBlocked={heroBlocked}
        treasureCollecting={treasureCollecting}
        winAnimation={winAnimation}
      />

      {isFinished && result && (
        <div className={`hw-result ${result.outcome === "win" ? "hw-result--win" : "hw-result--lose"}`}>
          <h2>
            {result.outcome === "win"
              ? "Princezna je zachráněná!"
              : "Princezna čeká dál..."}
          </h2>
          {result.outcome === "win" && result.treasureCollected && (
            <p>A poklad v kapse!</p>
          )}
          <div className="hw-result-actions">
            {canReplay ? (
              <>
                <button className="btn btn-primary" onClick={handleRetry}>
                  Zkusit znovu
                </button>
                <button className="btn btn-secondary" onClick={handleNewMap}>
                  Nová mapa
                </button>
              </>
            ) : (
              <p className="game-window-expired">Herní čas vypršel</p>
            )}
            <button className="btn btn-secondary" onClick={() => navigate("/")}>
              Konec
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
        Konec
      </button>
    </div>
  );
}

function heroWalkLevel(xp: number): number {
  return Math.floor(xp / 100);
}
