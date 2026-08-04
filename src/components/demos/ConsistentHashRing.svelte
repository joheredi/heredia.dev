<script>
  /**
   * Interactive consistent-hashing ring. The point of the demo is the
   * "keys moved" counter: it makes the difference between `hash % N` and a
   * hash ring measurable rather than asserted.
   */

  const POOL = ["alpha", "beta", "gamma", "delta", "epsilon"];
  const KEYS = Array.from({ length: 24 }, (_, i) => `user:${1000 + i * 7}`);

  const CX = 150;
  const CY = 150;
  const R_RING = 108;
  const R_KEYS = 88;
  const TICK = 9;

  /** FNV-1a, 32-bit. */
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** FNV-1a alone avalanches poorly on short strings and visibly clusters here. */
  function hash(str) {
    let h = fnv1a(str);
    h ^= h >>> 16;
    h = Math.imul(h, 0x21f0aaad);
    h ^= h >>> 15;
    h = Math.imul(h, 0x735a2d97);
    h ^= h >>> 15;
    return h >>> 0;
  }

  /** Hash projected onto [0, 1): a position on the ring. */
  const unit = (str) => hash(str) / 0x100000000;

  function point(pos, radius) {
    const a = pos * Math.PI * 2 - Math.PI / 2;
    return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
  }

  function polygon(sides, rotationDeg, x, y, r) {
    const rot = (rotationDeg * Math.PI) / 180;
    return Array.from({ length: sides }, (_, i) => {
      const a = rot + (i * Math.PI * 2) / sides;
      return `${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`;
    }).join(" ");
  }

  const SHAPES = [
    null,
    { sides: 3, rot: -90 },
    { sides: 4, rot: -90 },
    { sides: 4, rot: -45 },
    { sides: 5, rot: -90 },
  ];

  let activeNodes = $state(["alpha", "beta", "gamma"]);
  let replicas = $state(4);
  let strategy = $state("ring");
  let probeKey = $state(KEYS[9]);
  let traceToken = $state(0);
  let sweep = $state(1);
  let lastChange = $state(null);

  const ordered = $derived(POOL.filter((n) => activeNodes.includes(n)));
  const colorOf = (node) => `var(--n${POOL.indexOf(node)})`;
  const shapeOf = (node) => SHAPES[POOL.indexOf(node)];

  const vnodes = $derived(
    ordered
      .flatMap((node) =>
        Array.from({ length: replicas }, (_, r) => ({
          node,
          label: `${node}#${r}`,
          pos: unit(`${node}#${r}`),
        })),
      )
      .sort((a, b) => a.pos - b.pos),
  );

  const keyPositions = new Map(KEYS.map((k) => [k, unit(k)]));

  /** Index of the first virtual node at or clockwise-after `pos`, wrapping. */
  function successor(pos, ring) {
    let lo = 0;
    let hi = ring.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ring[mid].pos < pos) lo = mid + 1;
      else hi = mid;
    }
    return lo === ring.length ? 0 : lo;
  }

  const assignment = $derived.by(() => {
    const map = new Map();
    if (ordered.length === 0) return map;
    for (const key of KEYS) {
      if (strategy === "modulo") {
        map.set(key, ordered[hash(key) % ordered.length]);
      } else {
        map.set(key, vnodes[successor(keyPositions.get(key), vnodes)].node);
      }
    }
    return map;
  });

  const counts = $derived(
    ordered.map((node) => ({
      node,
      count: KEYS.filter((k) => assignment.get(k) === node).length,
    })),
  );

  const probe = $derived.by(() => {
    if (ordered.length === 0) return null;
    const pos = keyPositions.get(probeKey);
    const owner = assignment.get(probeKey);
    if (strategy === "modulo") {
      const h = hash(probeKey);
      return { pos, owner, modulo: { h, index: h % ordered.length } };
    }
    const vn = vnodes[successor(pos, vnodes)];
    return { pos, owner, vnode: vn, delta: (vn.pos - pos + 1) % 1 };
  });

  /** Changing the ring re-runs the trace, so the arc never shows a stale path. */
  const topology = $derived(`${strategy}:${ordered.join(",")}:${replicas}`);

  $effect(() => {
    probeKey;
    traceToken;
    topology;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (strategy !== "ring" || reduced) {
      sweep = 1;
      return;
    }
    sweep = 0;
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - started) / 650);
      sweep = 1 - Math.pow(1 - t, 3);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  });

  /** Wraps a mutation so we can report how many keys changed owner because of it. */
  function change(label, mutate) {
    const before = new Map(assignment);
    mutate();
    let moved = 0;
    for (const [key, node] of assignment) {
      if (before.get(key) !== node) moved++;
    }
    lastChange = { label, moved, total: KEYS.length };
  }

  function toggleNode(node) {
    const on = activeNodes.includes(node);
    if (on && activeNodes.length === 1) return;
    change(`${on ? "removed" : "added"} ${node}`, () => {
      activeNodes = on
        ? activeNodes.filter((n) => n !== node)
        : [...activeNodes, node];
    });
  }

  function setReplicas(event) {
    const next = Number(event.currentTarget.value);
    if (next === replicas) return;
    change(`set virtual nodes to ${next}`, () => {
      replicas = next;
    });
  }

  function setStrategy(next) {
    if (next === strategy) return;
    change(`switched to ${next === "ring" ? "hash ring" : "hash % N"}`, () => {
      strategy = next;
    });
  }

  function reset() {
    activeNodes = ["alpha", "beta", "gamma"];
    replicas = 4;
    strategy = "ring";
    lastChange = null;
    traceToken++;
  }

  const arcPath = $derived.by(() => {
    if (!probe || strategy !== "ring" || !probe.delta) return null;
    const span = probe.delta * sweep;
    const [x0, y0] = point(probe.pos, R_RING);
    const [x1, y1] = point(probe.pos + span, R_RING);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R_RING} ${R_RING} 0 ${span > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  });

  const pct = (n) => Math.round((n / KEYS.length) * 100);

  const summary = $derived(
    (strategy === "ring"
      ? `${ordered.length} nodes \u00d7 ${replicas} virtual node${replicas === 1 ? "" : "s"} = ${vnodes.length} points on the ring. `
      : `${ordered.length} nodes addressed by hash % ${ordered.length}. `) +
      counts.map((c) => `${c.node} holds ${c.count}`).join(", ") +
      ` of ${KEYS.length} keys.`,
  );
</script>

<figure class="demo">
  <div class="stage">
    <svg viewBox="0 0 300 300" role="img" aria-label={summary}>
      <circle
        cx={CX}
        cy={CY}
        r={R_RING}
        fill="none"
        stroke="var(--rule-strong, #c6c3b9)"
        stroke-width="1.5"
      />
      <line
        x1={CX}
        y1={CY - R_RING - 6}
        x2={CX}
        y2={CY - R_RING + 6}
        stroke="var(--fg-faint, #83817a)"
        stroke-width="1"
      />
      <text class="axis" x={CX} y={CY - R_RING - 12} text-anchor="middle">
        0.0 / 1.0
      </text>
      <text class="axis" x={CX + R_RING + 16} y={CY + 4} text-anchor="middle">
        0.25
      </text>
      <text class="axis" x={CX} y={CY + R_RING + 20} text-anchor="middle">0.5</text>
      <text class="axis" x={CX - R_RING - 16} y={CY + 4} text-anchor="middle">
        0.75
      </text>

      {#if arcPath}
        <path
          d={arcPath}
          fill="none"
          stroke="var(--accent, #1a5e7a)"
          stroke-width="4"
          stroke-linecap="round"
          opacity="0.5"
        />
      {/if}

      {#if strategy === "ring"}
        {#each vnodes as vn (vn.label)}
          {@const inner = point(vn.pos, R_RING - TICK)}
          {@const outer = point(vn.pos, R_RING + TICK)}
          <line
            x1={inner[0]}
            y1={inner[1]}
            x2={outer[0]}
            y2={outer[1]}
            stroke={colorOf(vn.node)}
            stroke-width="2.5"
            stroke-linecap="round"
          >
            <title>{vn.label} at {vn.pos.toFixed(3)}</title>
          </line>
        {/each}
      {/if}

      {#each KEYS as key (key)}
        {@const pos = keyPositions.get(key)}
        {@const owner = assignment.get(key)}
        {@const at = point(pos, R_KEYS)}
        {@const shape = owner ? shapeOf(owner) : null}
        {@const fill = owner ? colorOf(owner) : "var(--fg-faint, #83817a)"}
        <g class="key">
          {#if shape}
            <polygon points={polygon(shape.sides, shape.rot, at[0], at[1], 5.2)} {fill}>
              <title>{key} to {owner} (position {pos.toFixed(3)})</title>
            </polygon>
          {:else}
            <circle cx={at[0]} cy={at[1]} r="4.4" {fill}>
              <title>{key} to {owner ?? "unassigned"} (position {pos.toFixed(3)})</title>
            </circle>
          {/if}
          {#if key === probeKey}
            <circle
              cx={at[0]}
              cy={at[1]}
              r="10"
              fill="none"
              stroke="var(--accent, #1a5e7a)"
              stroke-width="1.5"
            />
          {/if}
        </g>
      {/each}

      <text class="center" x={CX} y={CY - 2} text-anchor="middle">
        {KEYS.length} keys
      </text>
      <text class="center dim" x={CX} y={CY + 14} text-anchor="middle">
        {strategy === "ring" ? `${vnodes.length} ring points` : `mod ${ordered.length}`}
      </text>
    </svg>
  </div>

  <div class="controls">
    <fieldset>
      <legend>Placement</legend>
      <div class="row">
        <button
          type="button"
          class="pill"
          aria-pressed={strategy === "ring"}
          onclick={() => setStrategy("ring")}
        >
          hash ring
        </button>
        <button
          type="button"
          class="pill"
          aria-pressed={strategy === "modulo"}
          onclick={() => setStrategy("modulo")}
        >
          hash % N
        </button>
      </div>
    </fieldset>

    <fieldset>
      <legend>Nodes</legend>
      <div class="row">
        {#each POOL as node (node)}
          <button
            type="button"
            class="pill node"
            style="--swatch: {colorOf(node)}"
            aria-pressed={activeNodes.includes(node)}
            aria-label="{activeNodes.includes(node) ? 'Remove' : 'Add'} node {node}"
            disabled={activeNodes.includes(node) && activeNodes.length === 1}
            onclick={() => toggleNode(node)}
          >
            <span class="dot" aria-hidden="true"></span>{node}
          </button>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend><label for="chr-replicas">Virtual nodes per node</label></legend>
      <div class="row">
        <input
          id="chr-replicas"
          type="range"
          min="1"
          max="12"
          step="1"
          value={replicas}
          disabled={strategy !== "ring"}
          oninput={setReplicas}
          aria-describedby="chr-replicas-value"
        />
        <output id="chr-replicas-value" class="num">{replicas}</output>
      </div>
      {#if strategy !== "ring"}
        <p class="hint">Virtual nodes only exist on the ring.</p>
      {/if}
    </fieldset>

    <fieldset>
      <legend><label for="chr-key">Trace a key</label></legend>
      <div class="row">
        <select id="chr-key" bind:value={probeKey}>
          {#each KEYS as key (key)}
            <option value={key}>{key}</option>
          {/each}
        </select>
        <button type="button" class="pill" onclick={() => traceToken++}>Replay</button>
        <button type="button" class="pill" onclick={reset}>Reset</button>
      </div>
    </fieldset>
  </div>

  <div class="readout" aria-live="polite">
    <p class="line">{summary}</p>
    {#if probe}
      {#if strategy === "ring"}
        <p class="line">
          <code>{probeKey}</code> hashes to <b>{probe.pos.toFixed(3)}</b>. Walking
          clockwise, the first virtual node is <code>{probe.vnode.label}</code> at
          <b>{probe.vnode.pos.toFixed(3)}</b>, so <b>{probe.owner}</b> owns it.
        </p>
      {:else}
        <p class="line">
          <code>{probeKey}</code> hashes to <b>{probe.modulo.h}</b>, and
          {probe.modulo.h} mod {ordered.length} = {probe.modulo.index}, which is
          <b>{probe.owner}</b>.
        </p>
      {/if}
    {/if}
    {#if lastChange}
      <p class="line change">
        Last change: {lastChange.label} &rarr;
        <b>{lastChange.moved} of {lastChange.total} keys moved ({pct(lastChange.moved)}%)</b>.
      </p>
    {/if}
  </div>

  <table>
    <caption class="visually-hidden">Keys held by each node</caption>
    <thead>
      <tr>
        <th scope="col">Node</th>
        <th scope="col">Keys</th>
        <th scope="col">Share</th>
      </tr>
    </thead>
    <tbody>
      {#each counts as row (row.node)}
        <tr>
          <th scope="row">
            <span class="dot" style="--swatch: {colorOf(row.node)}" aria-hidden="true"
            ></span>{row.node}
          </th>
          <td class="num">{row.count}</td>
          <td>
            <span class="share">
              <span class="bar" aria-hidden="true">
                <span
                  style="transform: scaleX({row.count / KEYS.length}); background: {colorOf(
                    row.node,
                  )}"
                ></span>
              </span>
              <span class="num">{pct(row.count)}%</span>
            </span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <figcaption>
    Twenty-four fixed keys hashed with FNV-1a. Marker shape and colour both encode
    the owning node.
  </figcaption>
</figure>

<style>
  .demo {
    /*
     * Categorical hues have no site token; everything else is a token so the
     * demo follows the page theme.
     */
    --n0: #1a5e7a;
    --n1: #9a5b1f;
    --n2: #6b3fa0;
    --n3: #1d7a4a;
    --n4: #b02f2f;

    margin: var(--space-6, 2rem) 0;
    padding: var(--space-4, 1rem);
    border: 1px solid var(--rule, #dedcd5);
    background: var(--bg-sunken, #f2f1ed);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: var(--step--1, 0.8125rem);
    line-height: 1.5;
    color: var(--fg, #1a1a18);
  }

  @media (prefers-color-scheme: dark) {
    .demo {
      --n0: #8ec2d6;
      --n1: #e0b268;
      --n2: #c3a2ea;
      --n3: #6fc79a;
      --n4: #ef8f8f;
    }
  }

  .stage {
    max-width: 20rem;
    margin: 0 auto var(--space-4, 1rem);
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .key polygon,
  .key circle {
    transition: fill 0.25s ease;
  }

  text {
    font-family: var(--font-mono, ui-monospace, monospace);
    fill: var(--fg-muted, #5c5b56);
  }

  .axis {
    font-size: 9px;
    fill: var(--fg-faint, #83817a);
  }

  .center {
    font-size: 12px;
    fill: var(--fg, #1a1a18);
  }

  .center.dim {
    font-size: 10px;
    fill: var(--fg-faint, #83817a);
  }

  .controls {
    display: grid;
    gap: var(--space-3, 0.75rem);
  }

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }

  legend,
  legend label {
    padding: 0;
    font-size: var(--step--2, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-faint, #83817a);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    margin-top: var(--space-2, 0.5rem);
  }

  .pill {
    font: inherit;
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    padding: 0.25em 0.7em;
    color: var(--fg-muted, #5c5b56);
    background: var(--bg, #fcfcfa);
    border: 1px solid var(--rule-strong, #c6c3b9);
    border-radius: 3px;
    cursor: pointer;
  }

  .pill:hover:not(:disabled) {
    color: var(--fg, #1a1a18);
    border-color: var(--accent, #1a5e7a);
  }

  .pill:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .pill[aria-pressed="true"] {
    color: var(--fg, #1a1a18);
    border-color: var(--accent, #1a5e7a);
    box-shadow: inset 0 0 0 1px var(--accent, #1a5e7a);
  }

  .pill.node[aria-pressed="false"] .dot {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--rule-strong, #c6c3b9);
  }

  .dot {
    display: inline-block;
    width: 0.6em;
    height: 0.6em;
    border-radius: 50%;
    background: var(--swatch);
    margin-right: 0.15em;
  }

  input[type="range"] {
    flex: 1 1 8rem;
    min-width: 6rem;
    max-width: 14rem;
    accent-color: var(--accent, #1a5e7a);
  }

  select {
    font: inherit;
    color: inherit;
    background: var(--bg, #fcfcfa);
    border: 1px solid var(--rule-strong, #c6c3b9);
    border-radius: 3px;
    padding: 0.25em 0.4em;
    max-width: 12rem;
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: var(--space-1, 0.25rem) 0 0;
    color: var(--fg-faint, #83817a);
  }

  .readout {
    margin-top: var(--space-4, 1rem);
    padding-top: var(--space-3, 0.75rem);
    border-top: 1px solid var(--rule, #dedcd5);
  }

  .line {
    margin: 0 0 var(--space-2, 0.5rem);
    color: var(--fg-muted, #5c5b56);
    overflow-wrap: break-word;
  }

  .line:last-child {
    margin-bottom: 0;
  }

  .line b {
    color: var(--fg, #1a1a18);
    font-weight: 600;
  }

  .line code {
    font-family: inherit;
    color: var(--fg, #1a1a18);
  }

  .change {
    color: var(--fg, #1a1a18);
  }

  /* The demo sits inside `.prose`, whose table rules would otherwise apply. */
  table {
    display: table;
    width: 100%;
    margin-top: var(--space-4, 1rem);
    border-collapse: collapse;
  }

  th,
  td {
    text-align: left;
    padding: 0.3em 0.5em 0.3em 0;
    border-bottom: 1px solid var(--rule, #dedcd5);
    font-weight: 400;
    vertical-align: middle;
  }

  thead th {
    font-size: var(--step--2, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-faint, #83817a);
  }

  th:first-child {
    width: 7rem;
  }

  th:nth-child(2),
  td.num {
    width: 3rem;
  }

  tbody th {
    white-space: nowrap;
    text-transform: none;
    letter-spacing: 0;
    font-size: inherit;
    color: var(--fg, #1a1a18);
  }

  .share {
    display: flex;
    align-items: center;
    gap: 0.5em;
  }

  .bar {
    display: block;
    flex: 1 1 4rem;
    height: 0.55em;
    background: var(--rule, #dedcd5);
    border-radius: 2px;
    overflow: hidden;
  }

  .bar > span {
    display: block;
    height: 100%;
    width: 100%;
    transform-origin: left center;
    transition: transform 0.25s ease;
  }

  figcaption {
    margin-top: var(--space-3, 0.75rem);
    color: var(--fg-faint, #83817a);
    font-size: var(--step--2, 0.75rem);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
      .key polygon,
      .key circle,
      .bar > span {
      transition: none;
    }
  }
</style>
