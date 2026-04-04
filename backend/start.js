#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname);

// Start NestJS with ts-node
const nestProcess = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'src/main.ts'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' }
});

nestProcess.on('error', (err) => {
  console.error('Failed to start NestJS:', err);
  process.exit(1);
});

nestProcess.on('close', (code) => {
  console.log(`NestJS process exited with code ${code}`);
  process.exit(code);
});

// Handle termination
process.on('SIGTERM', () => {
  nestProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  nestProcess.kill('SIGINT');
});
