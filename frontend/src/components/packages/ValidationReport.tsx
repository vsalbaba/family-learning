import type { ValidationResult } from "../../types/package";

interface Props {
  result: ValidationResult;
}

export default function ValidationReport({ result }: Props) {
  if (result.hard_errors.length === 0 && result.soft_warnings.length === 0) {
    return (
      <div className="validation-report validation-report--ok">
        Balíček je validní, žádné chyby ani varování.
      </div>
    );
  }

  return (
    <div className="validation-report">
      {result.hard_errors.length > 0 && (
        <div className="validation-section validation-section--errors">
          <h4>Chyby ({result.hard_errors.length})</h4>
          <ul>
            {result.hard_errors.map((e, i) => (
              <li key={i}>
                <code>{e.code}</code> {e.message}
                {e.path && <span className="val-path"> @ {e.path}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.soft_warnings.length > 0 && (
        <div className="validation-section validation-section--warnings">
          <h4>Varování ({result.soft_warnings.length})</h4>
          <ul>
            {result.soft_warnings.map((w, i) => (
              <li key={i}>
                <code>{w.code}</code> {w.message}
                {w.path && <span className="val-path"> @ {w.path}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
