import { spawnSync } from "node:child_process";
const command = process.platform === "win32" ? "py" : "python3";
const prefix = process.platform === "win32" ? ["-3.12"] : [];
const result = spawnSync(command, [...prefix, "-m", "pytest", "tests/python/test_adjudicator_direct.py", "-q", "--tb=short"], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
