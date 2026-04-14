import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { login as apiLogin, setup as apiSetup, getSetupStatus } from "../../api/auth";
import PinInput from "./PinInput";

type Screen = "name" | "pin" | "setup-app-pin" | "setup-name" | "setup-pin";

export default function LoginScreen() {
  const { setUser } = useAuth();
  const [screen, setScreen] = useState<Screen>("name");
  const [name, setName] = useState("");
  const [appPin, setAppPin] = useState("");
  const [error, setError] = useState("");
  const [parentExists, setParentExists] = useState(true);

  useEffect(() => {
    getSetupStatus().then((s) => setParentExists(s.parent_exists)).catch(() => {});
  }, []);

  async function handleNameSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError("");
    setScreen("pin");
  }

  async function handlePin(pin: string) {
    setError("");
    try {
      const resp = await apiLogin(name.trim(), pin);
      setUser(resp.user, resp.token);
    } catch {
      setError("Nesprávný PIN");
    }
  }

  async function handleSetupPin(pin: string) {
    setError("");
    try {
      await apiSetup(name.trim(), pin, appPin);
      const resp = await apiLogin(name.trim(), pin);
      setUser(resp.user, resp.token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chyba při vytváření účtu");
    }
  }

  // Setup flow: enter app PIN
  if (screen === "setup-app-pin") {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Ověření</h1>
          <p>Zadejte PIN aplikace:</p>
          <PinInput
            onComplete={(pin) => {
              setAppPin(pin);
              setError("");
              setScreen("setup-name");
            }}
            error={error}
          />
          <button className="btn btn-secondary" onClick={() => { setScreen("name"); setError(""); }}>
            Zpět
          </button>
        </div>
      </div>
    );
  }

  // Setup flow: enter parent name
  if (screen === "setup-name") {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Vítejte!</h1>
          <p>Vytvořte rodičovský účet</p>
          <input
            type="text"
            placeholder="Vaše jméno"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && setScreen("setup-pin")}
            className="setup-name-input"
            autoFocus
          />
          <button
            onClick={() => setScreen("setup-pin")}
            className="btn btn-primary"
            disabled={!name.trim()}
          >
            Pokračovat
          </button>
        </div>
      </div>
    );
  }

  // Setup flow: enter PIN
  if (screen === "setup-pin") {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h2>{name.trim()}</h2>
          <p>Zvolte si PIN:</p>
          <PinInput onComplete={handleSetupPin} error={error} />
          <button className="btn btn-secondary" onClick={() => setScreen("setup-name")}>
            Zpět
          </button>
        </div>
      </div>
    );
  }

  // Login: enter name
  if (screen === "name") {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Kdo jsi?</h1>
          <input
            type="text"
            placeholder="Zadej své jméno"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
            className="setup-name-input"
            autoFocus
          />
          <button
            className="btn btn-primary"
            onClick={handleNameSubmit}
            disabled={!name.trim()}
          >
            Pokračovat
          </button>
          {!parentExists && (
            <p style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
              <button
                className="btn btn-small btn-secondary"
                onClick={() => setScreen("setup-app-pin")}
              >
                Vytvořit nový účet
              </button>
            </p>
          )}
          {error && <p className="pin-error">{error}</p>}
        </div>
      </div>
    );
  }

  // Login: enter PIN
  return (
    <div className="login-screen">
      <div className="login-card">
        <h2>Ahoj, {name.trim()}!</h2>
        <p>Zadej PIN:</p>
        <PinInput onComplete={handlePin} error={error} />
        <button
          className="btn btn-secondary"
          onClick={() => {
            setScreen("name");
            setError("");
          }}
        >
          Zpět
        </button>
      </div>
    </div>
  );
}
