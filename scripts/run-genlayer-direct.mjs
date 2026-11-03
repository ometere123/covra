import { spawnSync } from "node:child_process";
const command = process.platform === "win32" ? "py" : "python3";
const prefix = process.platform === "win32" ? ["-3.12"] : [];
const args = process.argv.includes("--validate") ? ["scripts/validate-bradbury-sdk.py"]
  : ["-m", "pytest", "tests/python/test_adjudicator_direct.py", "-q", "--tb=short"];
const result = spawnSync(command, [...prefix, ...args], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
