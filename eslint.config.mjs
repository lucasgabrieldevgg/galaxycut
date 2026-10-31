import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// v9: a rede de segurança volta ligada. ERRO = código morto objetivo
// (debugger, unreachable, fallthrough…). WARN = dívida visível sem travar o
// CI (any, deps de hooks, console.log) — cada release vai zerando os warnings.
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript — avisos visíveis, sem travar o CI
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "warn",
    "@typescript-eslint/no-unused-disable-directive": "off",

    // React
    "react-hooks/exhaustive-deps": "warn",
    "react-hooks/purity": "warn",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js (app de canvas, página única)
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // JS — os objetivos são ERRO
    "prefer-const": "warn",
    "no-unused-vars": "off",
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "no-debugger": "error",
    "no-empty": "off",
    "no-irregular-whitespace": "error",
    "no-case-declarations": "error",
    "no-fallthrough": "error",
    "no-mixed-spaces-and-tabs": "error",
    // no-undef/no-redeclare ficam OFF de propósito: o compilador TS já pega os
    // dois, e ligar no-undef em codebase TS é chuva de falso-positivo (globals
    // do DOM/React que o ESLint não conhece).
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "error",
    "no-useless-escape": "error",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills/**", "desktop/**", "scripts/**", "tests/**", "tool-results/**", "download/**", "upload/**", "mini-services/**", ".zscripts/**"]
}];

export default eslintConfig;
