// T010 — Witness panel (PROJECT_BOOK §5.2).
//
// One card per failing required check: kind, first blocking
// condition, note, the parallel recommendation (joined by witness_id,
// T009-U03), and a toggle that shows the reduced scenario next to
// the original input scenario. The component only renders report data.

import { useState } from "react";
import type { ReportV1, ScenarioV1 } from "../core/types.js";
import type { WitnessRecommendation } from "../core/witness-reducer.js";
import type { ReportWitness } from "../core/types.js";

export interface WitnessPanelProps {
  report: ReportV1;
  recommendations: WitnessRecommendation[];
  scenario: ScenarioV1;
}

function WitnessCard({
  witness,
  recommendation,
  scenario,
}: {
  witness: ReportWitness;
  recommendation: WitnessRecommendation | undefined;
  scenario: ScenarioV1;
}): React.ReactElement {
  const [showDiff, setShowDiff] = useState(false);
  return (
    <div>
      <h3>
        Witness <code>{witness.id}</code> — {witness.kind}
      </h3>
      <p>
        Check: <code>{witness.check_context ?? "(none)"}</code>
        <br />
        First blocking condition: <code>{witness.first_blocking_condition}</code>
      </p>
      <p>{witness.note}</p>
      {recommendation !== undefined && (
        <p>
          <strong>Recommendation ({recommendation.rule_id}):</strong> {recommendation.recommendation}
        </p>
      )}
      <p>
        <button type="button" onClick={() => setShowDiff((v) => !v)}>
          {showDiff ? "Hide reduced vs original scenario" : "Show reduced vs original scenario"}
        </button>
      </p>
      {showDiff && (
        <div>
          <h4>Original scenario</h4>
          <pre>{JSON.stringify(scenario, null, 2)}</pre>
          <h4>Reduced scenario (witness)</h4>
          {witness.scenario !== null ? (
            <pre>{JSON.stringify(witness.scenario, null, 2)}</pre>
          ) : (
            <p>This witness is not scenario-shaped; it is witnessed by its conflicting providers.</p>
          )}
        </div>
      )}
      {witness.scenario !== null && (
        <details>
          <summary>Reduced scenario (JSON)</summary>
          <pre>{JSON.stringify(witness.scenario, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

export function WitnessPanel({ report, recommendations, scenario }: WitnessPanelProps): React.ReactElement {
  return (
    <section>
      <h2>Witness</h2>
      {report.witnesses.length === 0 && <p>No failing required checks — no witness was needed.</p>}
      {report.witnesses.map((witness) => (
        <WitnessCard
          key={witness.id}
          witness={witness}
          recommendation={recommendations.find((r) => r.witness_id === witness.id)}
          scenario={scenario}
        />
      ))}
    </section>
  );
}

export default WitnessPanel;
