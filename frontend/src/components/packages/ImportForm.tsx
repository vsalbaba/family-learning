import { useState, useRef } from "react";
import { importPackageJson, importPackageFile } from "../../api/packages";
import type { ImportResponse } from "../../types/package";
import ValidationReport from "./ValidationReport";

interface Props {
  onSuccess: () => void;
}

export default function ImportForm({ onSuccess }: Props) {
  const [jsonText, setJsonText] = useState("");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePaste() {
    if (!jsonText.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await importPackageJson(jsonText);
      setResult(resp);
      if (resp.package) onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const resp = await importPackageFile(file);
      setResult(resp);
      if (resp.package) onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="import-form">
      <div className="import-tabs">
        <div className="import-paste">
          <h3>Vložit JSON</h3>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='{"metadata": {"name": "..."}, "items": [...]}'
            rows={12}
            className="json-textarea"
          />
          <button
            className="btn btn-primary"
            onClick={handlePaste}
            disabled={loading || !jsonText.trim()}
          >
            {loading ? "Importuji..." : "Importovat"}
          </button>
        </div>

        <div className="import-divider">nebo</div>

        <div className="import-upload">
          <h3>Nahrát soubor</h3>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleFile}
            style={{ display: "none" }}
          />
          <button
            className="btn btn-secondary"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
          >
            Vybrat soubor .json
          </button>
        </div>
      </div>

      {error && <div className="import-error">{error}</div>}

      {result && (
        <div className="import-result">
          {result.package && (
            <div className="import-success">
              Balíček „{result.package.name}" importován ({result.package.item_count} otázek).
            </div>
          )}
          <ValidationReport result={result.validation} />
        </div>
      )}
    </div>
  );
}
