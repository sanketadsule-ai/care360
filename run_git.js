const { execSync } = require('child_process');
const fs = require('fs');

try {
  const output = execSync('git status', { cwd: 'c:/Users/6451/Documents/care360/care360', encoding: 'utf-8' });
  fs.writeFileSync('c:/Users/6451/Documents/care360/care360/git_status_node.txt', output);
} catch (e) {
  fs.writeFileSync('c:/Users/6451/Documents/care360/care360/git_status_node.txt', e.toString() + '\n' + (e.stdout ? e.stdout.toString() : ''));
}
