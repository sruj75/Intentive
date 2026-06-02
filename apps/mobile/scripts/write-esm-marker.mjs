// Marks the pure-core build output (dist/) as ESM so Node loads the compiled
// .js as ES modules, while the package root stays CommonJS for Expo's
// babel/metro config files. Keeps the fast node:test path decoupled from the
// React Native toolchain (split test toolchains by axis).
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
writeFileSync("dist/package.json", '{\n  "type": "module"\n}\n');
