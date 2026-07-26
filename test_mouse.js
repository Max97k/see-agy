const fs = require('fs');
const content = fs.readFileSync('frontend/src/components/TreemapCanvas.jsx', 'utf-8');
if (content.includes('setTooltipPos') || content.includes('tooltipPos')) {
  console.log('Error: tooltipPos state still exists.');
  process.exit(1);
} else {
  console.log('Success: tooltipPos replaced with direct DOM mutation.');
}
