/**
 * Empirical Stress Test Harness for AGY CLI Web Visualizer Decay Loop & Frontend Components
 */

const path = require('path');
const d3 = require(path.resolve(__dirname, '../frontend/node_modules/d3'));

// Import normalization logic matching App.jsx / TreemapCanvas.jsx
function normalizePath(p) {
  if (!p) return '';
  return p.replace(/^\.\//, '').replace(/^\//, '');
}

// Decay Intensity Calculation formula from TreemapCanvas.jsx
function computeDecayIntensity(now, timestamp) {
  if (typeof timestamp !== 'number' || isNaN(timestamp)) return 0;
  const elapsed = now - timestamp;
  const intensity = Math.max(0, 1.0 - elapsed / 1500);
  return intensity;
}

function getRgbaString(type, intensity) {
  // Clamped vs unclamped behavior check
  if (type === 'WRITE') {
    return `rgba(249, 115, 22, ${intensity * 0.7})`;
  } else {
    return `rgba(56, 189, 248, ${intensity * 0.7})`;
  }
}

// Mock D3 treemap computation matching TreemapCanvas.jsx
function computeTreemapLayout(dirTree, dimensions = { width: 800, height: 600 }) {
  if (!dirTree || !dirTree.name) {
    return { rootNode: null, leaves: [], directories: [] };
  }

  const width = Math.max(100, dimensions.width);
  const height = Math.max(100, dimensions.height);

  const root = d3.hierarchy(dirTree)
    .sum((d) => (d.children ? 0 : (d.size && d.size > 0 ? d.size : 200)))
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  const layout = d3.treemap()
    .tile(d3.treemapSquarify)
    .size([width, height])
    .paddingOuter(4)
    .paddingTop((d) => (d.depth > 0 ? 20 : 24))
    .paddingInner(2);

  layout(root);

  const descendants = root.descendants();
  const leavesList = root.leaves();
  const dirsList = descendants.filter((d) => d.children && d.depth >= 0);

  return { rootNode: root, leaves: leavesList, directories: dirsList };
}

let passCount = 0;
let failCount = 0;
const findings = [];

function assert(condition, testName, details = '') {
  if (condition) {
    passCount++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failCount++;
    findings.push({ testName, details });
    console.error(`  ✗ [FAIL] ${testName}: ${details}`);
  }
}

async function runDecayStressSuite() {
  console.log('====================================================');
  console.log('   Decay Loop & Treemap Empirical Stress Test Suite ');
  console.log('====================================================\n');

  // --- SECTION 1: Clock Skew & Timestamp Edge Cases ---
  console.log('--- 1. Clock Skew & Timestamp Edge Cases ---');

  const now = 10000;

  // Case 1.1: Exact match (elapsed = 0)
  const i0 = computeDecayIntensity(now, 10000);
  assert(i0 === 1.0, '1.1 Intensity at elapsed=0 is 1.0', `Got ${i0}`);

  // Case 1.2: Half elapsed (750ms)
  const i750 = computeDecayIntensity(now, 9250);
  assert(Math.abs(i750 - 0.5) < 0.001, '1.2 Intensity at elapsed=750ms is 0.5', `Got ${i750}`);

  // Case 1.3: Fully decayed (1500ms)
  const i1500 = computeDecayIntensity(now, 8500);
  assert(i1500 === 0, '1.3 Intensity at elapsed=1500ms is 0.0', `Got ${i1500}`);

  // Case 1.4: Past event beyond decay window (5000ms ago)
  const i5000 = computeDecayIntensity(now, 5000);
  assert(i5000 === 0, '1.4 Intensity at elapsed=5000ms is 0.0 (non-negative)', `Got ${i5000}`);

  // Case 1.5: Future timestamp (clock skew, timestamp = now + 3000)
  const iFuture = computeDecayIntensity(now, 13000);
  const rgbaFuture = getRgbaString('WRITE', iFuture);
  // Alpha becomes (1 - (-3000/1500)) * 0.7 = 3.0 * 0.7 = 2.1
  const alphaVal = parseFloat(rgbaFuture.split(',')[3]);
  assert(iFuture <= 1.0, '1.5 Future timestamp intensity is bounded <= 1.0', `Got intensity=${iFuture}, RGBA=${rgbaFuture}`);
  if (alphaVal > 1.0) {
    console.warn(`    ⚠️ ALERT: Future timestamp causes unclamped alpha ${alphaVal} in canvas fillStyle!`);
  }

  // Case 1.6: Invalid timestamp types (NaN, undefined, null, string)
  const iNaN = computeDecayIntensity(now, NaN);
  const iNull = computeDecayIntensity(now, null);
  const iUndef = computeDecayIntensity(now, undefined);
  assert(iNaN === 0 && iNull === 0 && iUndef === 0, '1.6 Invalid timestamp inputs return 0 intensity', `NaN=${iNaN}, null=${iNull}, undef=${iUndef}`);

  // --- SECTION 2: Treemap Layout & Structural Edge Cases ---
  console.log('\n--- 2. Treemap Layout & Structural Edge Cases ---');

  // Case 2.1: Null / Undefined / Empty dirTree
  const resNull = computeTreemapLayout(null);
  assert(resNull.leaves.length === 0 && resNull.directories.length === 0, '2.1 Null dirTree returns empty hierarchy');

  // Case 2.2: Empty directory tree (directory with 0 children)
  const emptyDirTree = { name: 'empty_root', path: '', type: 'directory', children: [] };
  const resEmpty = computeTreemapLayout(emptyDirTree);
  // Inspect if leaf node is produced for an empty directory
  assert(resEmpty.directories.length === 1, '2.2 Directory list contains root directory');
  assert(resEmpty.leaves.length === 0 || resEmpty.leaves[0].data.type === 'file', 
    '2.2 Empty directory does not produce false file leaf node', 
    `Leaves count=${resEmpty.leaves.length}, Leaf type=${resEmpty.leaves[0]?.data?.type}`
  );

  // Case 2.3: Single File Treemap
  const singleFileTree = {
    name: 'root', path: '', type: 'directory',
    children: [{ name: 'test.js', path: 'test.js', type: 'file', size: 100 }]
  };
  const resSingle = computeTreemapLayout(singleFileTree);
  assert(resSingle.leaves.length === 1 && resSingle.leaves[0].data.name === 'test.js', '2.3 Single file treemap renders 1 leaf');

  // Case 2.4: High-count tree (10,000 files stress test)
  const largeChildren = [];
  for (let i = 0; i < 10000; i++) {
    largeChildren.push({ name: `file_${i}.js`, path: `dir/file_${i}.js`, type: 'file', size: i + 1 });
  }
  const largeTree = {
    name: 'root', path: '', type: 'directory',
    children: [{ name: 'dir', path: 'dir', type: 'directory', children: largeChildren }]
  };

  const tStart = Date.now();
  const resLarge = computeTreemapLayout(largeTree);
  const tDuration = Date.now() - tStart;
  assert(resLarge.leaves.length === 10000, '2.4 Large tree (10k files) lays out 10,000 leaves', `Duration: ${tDuration}ms`);
  assert(tDuration < 500, '2.4 Treemap layout computation completed under 500ms', `Actual: ${tDuration}ms`);

  // Case 2.5: Zero & Negative file sizes handling
  const zeroSizeTree = {
    name: 'root', path: '', type: 'directory',
    children: [
      { name: 'zero.txt', path: 'zero.txt', type: 'file', size: 0 },
      { name: 'neg.txt', path: 'neg.txt', type: 'file', size: -100 }
    ]
  };
  const resZero = computeTreemapLayout(zeroSizeTree);
  assert(resZero.leaves.length === 2, '2.5 Files with size <= 0 render with non-zero fallback area', `Leaves: ${resZero.leaves.length}`);
  assert(resZero.leaves[0].x1 > resZero.leaves[0].x0 && resZero.leaves[1].x1 > resZero.leaves[1].x0, '2.5 Zero/negative size files have valid positive width');

  // --- SECTION 3: High Event Rate & State Scaling ---
  console.log('\n--- 3. High Event Rate & State Scaling ---');

  // Simulate Map state updates under 10,000 events
  const mapState = new Map();
  const tMapStart = Date.now();
  for (let i = 0; i < 10000; i++) {
    const p = normalizePath(`src/component_${i % 100}.jsx`);
    mapState.set(p, { type: i % 2 === 0 ? 'WRITE' : 'READ', timestamp: Date.now() });
  }
  const tMapDuration = Date.now() - tMapStart;
  assert(mapState.size === 100, '3.1 Map state normalizes paths and caps key count to unique files', `Size: ${mapState.size}`);
  assert(tMapDuration < 100, '3.2 10,000 state mutations processed under 100ms', `Duration: ${tMapDuration}ms`);

  // --- SECTION 4: Status Widget & Mascot State ---
  console.log('\n--- 4. Status Widget & Mascot State ---');

  function getMascotState(statusObj) {
    const status = statusObj?.status || 'idle';
    const isWorking = status === 'working';
    return {
      isWorking,
      mascotAnimationClass: isWorking ? 'animate-bounce text-emerald-400' : 'text-slate-400 scale-95',
      antennaClass: isWorking ? 'fill-emerald-400 animate-ping' : 'fill-slate-500'
    };
  }

  const sWorking = getMascotState({ status: 'working' });
  const sIdle = getMascotState({ status: 'idle' });
  const sNull = getMascotState(null);

  assert(sWorking.isWorking === true && sWorking.mascotAnimationClass.includes('animate-bounce'), '4.1 Working status triggers animate-bounce');
  assert(sIdle.isWorking === false && sIdle.mascotAnimationClass.includes('scale-95'), '4.2 Idle status triggers scale-95');
  assert(sNull.isWorking === false && sNull.mascotAnimationClass.includes('scale-95'), '4.3 Null status safely defaults to Idle');

  // Summary
  console.log('\n====================================================');
  console.log('                 Stress Suite Results               ');
  console.log('====================================================');
  console.log(`Passed Assertions: ${passCount}`);
  console.log(`Failed Assertions: ${failCount}`);
  console.log('----------------------------------------------------');

  if (failCount > 0) {
    console.error(`Result: ${failCount} stress assertions failed!`);
    findings.forEach(f => console.error(`  - ${f.testName}: ${f.details}`));
  } else {
    console.log('Result: All stress assertions passed!');
  }
}

runDecayStressSuite().catch(err => {
  console.error('Fatal error in stress suite:', err);
  process.exit(1);
});
