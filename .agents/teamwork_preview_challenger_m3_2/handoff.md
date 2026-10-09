# Milestone 3 Frontend Build & Decay Stress Handoff Report

## Verdict
**Verdict: REJECT**

---

## 1. Observation

### 1.1 Frontend Build & Bundle Analysis
- Command: `npm run build` in `/home/user/see-agy/frontend`
- Output:
  ```text
  vite v5.4.21 building for production...
  ✓ 2095 modules transformed.
  dist/index.html                   0.50 kB │ gzip:  0.34 kB
  dist/assets/index-CCishXdF.css   18.83 kB │ gzip:  4.43 kB
  dist/assets/index-CvEaKqOE.js   249.89 kB │ gzip: 78.82 kB
  ✓ built in 1.05s
  ```
- Build compilation completed cleanly with zero syntax or bundling errors.

### 1.2 E2E Opaque-Box Suite Execution
- Command: `node tests/e2e.test.js`
- Output: Passed 11/11 tests across Tiers 1-4.

### 1.3 Empirical Stress Harness Execution (`node tests/decay_loop_stress.test.js`)
- Command: `node tests/decay_loop_stress.test.js`
- Output Findings:
  - `✗ [FAIL] 1.5 Future timestamp intensity is bounded <= 1.0: Got intensity=3, RGBA=rgba(249, 115, 22, 2.0999999999999996)`
  - `✗ [FAIL] 2.2 Empty directory does not produce false file leaf node: Leaves count=1, Leaf type=directory`

### 1.4 Direct Code Inspection

#### Observation A: Unclamped Alpha in Canvas Decay Render Loop
File: `/home/user/see-agy/frontend/src/components/TreemapCanvas.jsx`
Lines 141-147:
```javascript
const elapsed = now - eventData.timestamp;
const intensity = Math.max(0, 1.0 - elapsed / 1500);

if (intensity > 0) {
  if (eventData.type === 'WRITE') {
    // Orange #F97316
    ctx.fillStyle = `rgba(249, 115, 22, ${intensity * 0.7})`;
```
When `eventData.timestamp` is set in the future (e.g. clock skew between machines or client system clock drift), `elapsed = now - eventData.timestamp` is negative (e.g. `-3000ms`).
`intensity = Math.max(0, 1.0 - (-3000 / 1500)) = 3.0`.
`ctx.fillStyle` is assigned `rgba(249, 115, 22, 2.1)`.
According to HTML Canvas 2D / CSS specifications, alpha > 1.0 is an invalid color syntax. Canvas 2D silently ignores invalid `ctx.fillStyle` assignments, preserving whatever color was previously set on the context, leading to visual corruption and stuck color highlights.

#### Observation B: Empty Directory Treemap Misclassification
File: `/home/user/see-agy/frontend/src/components/TreemapCanvas.jsx`
Lines 57-75:
```javascript
const root = d3.hierarchy(dirTree)
  .sum((d) => (d.children ? 0 : (d.size && d.size > 0 ? d.size : 200)))
  .sort((a, b) => (b.value || 0) - (a.value || 0));

...
const descendants = root.descendants();
const leavesList = root.leaves();
const dirsList = descendants.filter((d) => d.children && d.depth >= 0);
```
When `dirTree` contains an empty folder (`{ name: 'empty_dir', path: 'empty_dir', type: 'directory', children: [] }`), D3 hierarchy sets `d.children = undefined` for empty arrays.
Because `d.children` is undefined, D3 `root.leaves()` classifies the empty directory as a leaf file node.
In `TreemapCanvas.jsx`, `leaves.map(...)` renders a `<FileCode>` icon and file tile labeled `"empty_dir"`, misrepresenting an empty folder as a code file in the visual matrix.

---

## 2. Logic Chain

1. Observation 1.1 confirms `npm run build` compiles without syntax or bundler errors, producing a lean 249.89 kB JS bundle and 18.83 kB CSS bundle.
2. Observation 1.2 confirms basic Socket.io streaming and mock REST events pass initial sanity tests.
3. However, Observation 1.3 & Observation A demonstrate that `TreemapCanvas.jsx` calculates intensity using `Math.max(0, 1.0 - elapsed / 1500)`. Because it lacks an upper bound clamp (`Math.min(1.0, ...)`), any negative `elapsed` value (clock skew, system time sync shift, future event timestamp) causes `intensity` to exceed 1.0.
4. Setting `ctx.fillStyle` to `rgba(249, 115, 22, 2.1)` is invalid CSS color syntax in HTML5 Canvas 2D. The browser context ignores the assignment and retains the prior `fillStyle`, creating persistent color rendering glitches during active visual decay.
5. Observation 1.3 & Observation B demonstrate that D3 hierarchy treats `children: []` as `children = undefined`. Consequently, empty directories are returned by `root.leaves()`. `TreemapCanvas` processes `leaves` as file nodes and displays `<FileCode>` icons for empty directories.
6. Therefore, while the build succeeds and standard events pass, the visual decay loop and treemap matrix suffer from 2 reproducible edge case defects under stress testing.

---

## 3. Caveats

- High event rate throughput testing (10,000 events/sec) showed acceptable Map update performance under 100ms.
- Responsive grid layout (`lg:grid-cols-4`, `hidden lg:flex`) and Status Widget mascot animation (`animate-bounce`, `animate-pulse`, `animate-ping`) function smoothly across desktop and mobile viewports.
- No other security vulnerabilities or memory leaks were detected.

---

## 4. Conclusion

**Verdict: REJECT**

The frontend build succeeds, but Milestone 3 acceptance criteria require a robust 1.5s visual decay loop and accurate D3 Treemap matrix layout. The implementation must be rejected due to two specific bugs:
1. **Clock Skew Unclamped Alpha**: Future/skewed timestamps yield alpha values > 1.0 (`rgba(..., 2.1)`), triggering Canvas 2D color assignment failures.
2. **Empty Directory Treemap Misclassification**: Empty directories (`children: []`) are misclassified as file leaf nodes by D3 hierarchy and rendered as code files with file icons.

---

## 5. Verification Method

To independently verify these findings:

1. **Build Check**:
   ```bash
   cd /home/user/see-agy/frontend
   npm run build
   ```

2. **Empirical Stress Test Suite Execution**:
   ```bash
   cd /home/user/see-agy
   node tests/decay_loop_stress.test.js
   ```
   Inspect failures 1.5 and 2.2 in the command output.

3. **Code Inspection**:
   - Inspect `frontend/src/components/TreemapCanvas.jsx` line 142 for missing `Math.min(1.0, ...)` upper bound clamping.
   - Inspect `frontend/src/components/TreemapCanvas.jsx` lines 57-75 for D3 `leaves()` behavior on empty directory nodes.
