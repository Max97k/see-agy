const fs = require('fs');
const content = fs.readFileSync('frontend/src/components/TreemapCanvas.jsx', 'utf-8');
const effectMatch = content.match(/}, \[dimensions, leaves, directories(.*)\]\);/);
if (effectMatch && effectMatch[1].includes('fileEventsMap')) {
    console.log('Error: fileEventsMap still in dependency array.');
    process.exit(1);
} else {
    console.log('Success: fileEventsMap removed from animation loop dependencies.');
}
