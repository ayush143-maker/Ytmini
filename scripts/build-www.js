#!/usr/bin/env node
// Copies the static site into www/ (Capacitor's webDir) and injects the
// native bridge script. The web build on Vercel is untouched.
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

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const marker = '<script src="/assets/js/api.js"></script>';

if (!html.includes(marker)) {
  throw new Error("index.html no longer contains the api.js script tag.");
}

fs.writeFileSync(
  path.join(out, "index.html"),
  html.replace(
    marker,
    '<script src="/assets/js/native.js"></script>\n  ' + marker
  )
);

console.log("www/ ready");
