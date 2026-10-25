#!/usr/bin/env node
// Copies the static site into www/ (Capacitor's webDir).
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "www");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

fs.cpSync(path.join(root, "assets"), path.join(out, "assets"), {
  recursive: true,
  filter: (src) => !path.basename(src).trim().endsWith(".gitkeep")
});

fs.copyFileSync(path.join(root, "index.html"), path.join(out, "index.html"));

console.log("www/ ready");
