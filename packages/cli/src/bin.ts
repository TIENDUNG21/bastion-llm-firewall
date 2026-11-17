#!/usr/bin/env node
import { nodeIo } from './io.js';
import { main } from './main.js';

main(process.argv.slice(2), nodeIo()).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err);
    process.exitCode = 3;
  },
);
