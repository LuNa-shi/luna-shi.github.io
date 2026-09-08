import './tec-explorer.css';

import { useEffect, useId, useState } from 'react';

import type { site } from '../../config/site';
import { scheduleTecTasks } from '../../utils/tec-schedule';

type Copy = typeof site.tec;
type Mode = 'triple' | 'operators' | 'topology' | 'parallel';

function Choices({
  labels,
  value,
  onChange,
  name,
}: {
  labels: readonly string[];
  value: number;
  onChange: (value: number) => void;
  name: string;
}) {
  return (
    <div className="tec-choices" role="group" aria-label={name}>
      {labels.map((label, i) => (
        <button type="button" key={label} aria-pressed={value === i} onClick={() => onChange(i)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Triple({ copy }: { copy: Copy }) {
  const [selected, setSelected] = useState(0);
  const [stage, setStage] = useState(0);
  const c = copy.triple;
  return (
    <>
      <Choices labels={c.tabs} value={selected} onChange={setSelected} name={copy.controls} />
      <div className="tec-triple">
        {c.tabs.map((label, i) => (
          <div key={label} className={`tec-primitive ${selected === i ? 'is-active' : ''}`}>
            <b>{label}</b>
            <span>{c.summaries[i]}</span>
          </div>
        ))}
      </div>
      <p className="tec-reading" aria-live="polite">
        {c.details[selected]}
      </p>
      <div className="tec-runtime">
        <b>{c.runtime}</b>
        <Choices labels={c.stages} value={stage} onChange={setStage} name={c.runtime} />
        <p className="tec-reading" aria-live="polite">
          {c.trajectory[stage]}
        </p>
        <button type="button" onClick={() => setStage((stage + 1) % c.stages.length)}>
          {stage === c.stages.length - 1 ? c.continuation : copy.next}
        </button>
        <p className="tec-runtime-note">{c.stable}</p>
      </div>
    </>
  );
}

function Operators({ copy }: { copy: Copy }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [validated, setValidated] = useState(false);
  const c = copy.operators;
  useEffect(() => {
    if (!playing) return;
    if (step === 4) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStep((previous) => previous + 1), 2200);
    return () => window.clearTimeout(timer);
  }, [playing, step]);
  const choose = (i: number) => {
    setPlaying(false);
    setStep(i);
  };
  return (
    <>
      <div className="tec-step-controls">
        <button
          type="button"
          onClick={() => {
            if (step === 4) setStep(0);
            setPlaying(!playing);
          }}
        >
          {playing ? copy.pause : copy.play}
        </button>
        <button type="button" onClick={() => choose((step + 1) % 5)}>
          {step === 4 ? copy.reset : copy.next}
        </button>
      </div>
      <div className="tec-operator-track" role="group" aria-label={copy.controls}>
        {c.steps.map((label, i) => (
          <button
            type="button"
            className={step === i ? 'is-current' : ''}
            key={label}
            aria-pressed={step === i}
            onClick={() => choose(i)}
          >
            <span className="tec-step-number" aria-hidden="true">
              0{i + 1}
            </span>
            <b>{label}</b>
            <span>{c.subjects[i]}</span>
          </button>
        ))}
      </div>
      <div className="tec-current-step" aria-live="polite">
        <span className="tec-eyebrow">{step < 4 ? c.within : c.across}</span>
        <p>{c.details[step]}</p>
      </div>
      <p className="tec-runtime-note">{c.loop}</p>
      <div className={`tec-evolve-gate ${step === 4 ? 'is-current' : ''}`}>
        <span className="tec-eyebrow">{c.evidence}</span>
        <label>
          <input
            type="checkbox"
            checked={validated}
            onChange={(e) => setValidated(e.target.checked)}
          />
          {c.gateLabel}
        </label>
        <p aria-live="polite">
          <span className={`tec-gate-dot ${validated ? 'is-open' : ''}`} aria-hidden="true" />
          {validated ? c.released : c.gated}
        </p>
        <small>{c.noExperiment}</small>
      </div>
    </>
  );
}

function Topology({ copy }: { copy: Copy }) {
  const [preset, setPreset] = useState(0);
  const marker = useId().replaceAll(':', '');
  const c = copy.topology;
  const points =
    preset === 0
      ? [
          [60, 60],
          [210, 60],
          [210, 200],
          [60, 200],
        ]
      : [
          [135, 40],
          [50, 130],
          [220, 130],
          [135, 220],
        ];
  const edges =
    preset === 0
      ? [
          [0, 1],
          [1, 2],
          [2, 3],
        ]
      : [
          [0, 1],
          [0, 2],
          [1, 3],
          [2, 3],
        ];
  return (
    <>
      <Choices labels={c.presets} value={preset} onChange={setPreset} name={copy.controls} />
      <div className="tec-projection">
        <dl>
          {c.primitiveLabels.map((label, i) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{c.setups[preset][i]}</dd>
            </div>
          ))}
        </dl>
        <div className="tec-graph">
          <svg
            viewBox="0 0 270 260"
            role="img"
            aria-label={`${c.presets[preset]}. ${c.captions[preset]}`}
          >
            <defs>
              <marker
                id={marker}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0 0L10 5L0 10Z" />
              </marker>
            </defs>
            {edges.map(([a, b]) => {
              const [x1, y1] = points[a];
              const [x2, y2] = points[b];
              const length = Math.hypot(x2 - x1, y2 - y1);
              return (
                <line
                  key={`${a}-${b}`}
                  x1={x1 + ((x2 - x1) * 31) / length}
                  y1={y1 + ((y2 - y1) * 31) / length}
                  x2={x2 - ((x2 - x1) * 34) / length}
                  y2={y2 - ((y2 - y1) * 34) / length}
                  markerEnd={`url(#${marker})`}
                />
              );
            })}
            {points.map(([x, y], i) => (
              <g key={i} className={preset === 2 && i === 2 ? 'tec-specialist' : ''}>
                <circle cx={x} cy={y} r="30" />
                <text x={x} y={y} dy="0.35em" textAnchor="middle">
                  {c.nodes[i]}
                </text>
              </g>
            ))}
          </svg>
          <span className="tec-graph-key">
            {c.edge}
            <br />
            {preset === 2 ? c.diverse : c.shared}
          </span>
        </div>
      </div>
      <p className="tec-reading" aria-live="polite">
        {c.captions[preset]}
      </p>
    </>
  );
}

function Parallel({ copy }: { copy: Copy }) {
  const [structure, setStructure] = useState(1);
  const [workers, setWorkers] = useState(2);
  const [replay, setReplay] = useState(0);
  const c = copy.parallel;
  const inputId = useId();
  const result = scheduleTecTasks(structure === 0 ? 'chain' : 'fork', workers);
  return (
    <>
      <Choices
        labels={c.structures}
        value={structure}
        onChange={setStructure}
        name={copy.controls}
      />
      <label className="tec-worker-control" htmlFor={inputId}>
        <span>
          {c.workers}
          <b>{workers}</b>
        </span>
        <input
          id={inputId}
          type="range"
          min="1"
          max="6"
          step="1"
          value={workers}
          onChange={(e) => setWorkers(Number(e.target.value))}
        />
      </label>
      <div className="tec-timeline" key={`${structure}-${workers}-${replay}`}>
        <div className="tec-axis">
          {[0, 1, 2, 3, 4].map((time) => (
            <span key={time} style={{ left: `${time * 25}%` }}>
              {time}
            </span>
          ))}
        </div>
        {Array.from({ length: workers }, (_, i) => (
          <div className="tec-lane" key={i}>
            <span className="tec-lane-label">
              {c.worker} {i + 1}
            </span>
            <div className="tec-lane-track">
              {result.tasks
                .filter((task) => task.worker === i)
                .map((task) => (
                  <span
                    className="tec-task-block"
                    key={task.id}
                    style={{
                      left: `${task.start * 25}%`,
                      width: '25%',
                      animationDelay: `${task.start * 300}ms`,
                    }}
                  >
                    {c.nodes[task.id]}
                  </span>
                ))}
            </div>
          </div>
        ))}
        <span className="tec-time-label">{c.timeAxis}</span>
      </div>
      <div className="tec-results" aria-live="polite">
        <span>
          {c.duration}
          <b>
            {result.duration} <small>{c.unit}</small>
          </b>
        </span>
        <span>
          {c.speedup}
          <b>{(4 / result.duration).toFixed(2)}×</b>
        </span>
        <span>
          {c.bound}
          <b>{(4 / result.span).toFixed(2)}×</b>
        </span>
      </div>
      <p className="tec-reading">{structure === 0 ? c.chain : c.fork}</p>
      <button type="button" className="tec-replay" onClick={() => setReplay((x) => x + 1)}>
        {c.replay}
      </button>
      <small className="tec-assumptions">
        {c.work} {c.notCost} {c.static}
      </small>
    </>
  );
}

export default function TecExplorer({ mode, copy }: { mode: Mode; copy: Copy }) {
  const c = copy[mode];
  return (
    <figure className={`tec-viz tec-${mode}-figure`} aria-label={c.title}>
      <figcaption>
        <span className="tec-eyebrow">{copy.figureLabel}</span>
        <strong>{c.title}</strong>
        <span>{c.subtitle}</span>
      </figcaption>
      {mode === 'triple' && <Triple copy={copy} />}
      {mode === 'operators' && <Operators copy={copy} />}
      {mode === 'topology' && <Topology copy={copy} />}
      {mode === 'parallel' && <Parallel copy={copy} />}
    </figure>
  );
}
