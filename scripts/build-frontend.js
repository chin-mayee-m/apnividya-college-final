#!/usr/bin/env node
// Assembles the single-page frontend from the parts in frontend/src into
// backend/public/index.html. Kept as a script rather than a bundler so the
// project stays dependency-free on the client side.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'frontend', 'src');
const out = path.join(root, 'backend', 'public', 'index.html');

const css = fs.readFileSync(path.join(src, 'base.css'), 'utf8')
  + '\n' + fs.readFileSync(path.join(src, 'app.css'), 'utf8');

const js = ['01-core', '02-shell', '03-exams', '04-students', '05-player', '06-report']
  .map((n) => fs.readFileSync(path.join(src, n + '.js'), 'utf8'))
  .join('\n');

const shell = fs.readFileSync(path.join(src, 'index.template.html'), 'utf8');

fs.writeFileSync(out, shell.replace('/*STYLES*/', css).replace('/*SCRIPT*/', js));
console.log(`Built ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
