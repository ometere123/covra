import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      // COVRA intentionally synchronizes authenticated remote state from effects.
      // Keep the Next/React ruleset, but do not reject that established data-flow pattern.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];

export default config;
