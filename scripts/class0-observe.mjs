import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const agreementPath = resolve(root, argument("--agreement", "testbed/class0/task-agreement.json"));
const agreement = JSON.parse(readFileSync(agreementPath, "utf8"));
const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const digest = `0x${createHash("sha256").update(canonical(agreement.spec)).digest("hex")}`;
if (digest.toLowerCase() !== String(agreement.task_spec_hash).toLowerCase()) {
  throw new Error("Task specification digest does not match the signed agreement");
}
const task = agreement.spec;
const deadline = Date.parse(task.deadline);
if (!Number.isFinite(deadline)) throw new Error("Task deadline is not a valid UTC timestamp");
if (process.argv.includes("--wait")) {
  while (Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(deadline - Date.now(), 30_000)));
  }
}
if (Date.now() < deadline) throw new Error(`The frozen deadline has not passed: ${task.deadline}`);

const deliverableExists = existsSync(resolve(root, task.deliverable_path));
const observedAt = new Date().toISOString();
const observationId = `class0-${task.task_id}`;
const observation = {
  observation_id: observationId,
  coverage_class: 0,
  event_time: task.deadline,
  facts: {
    task_id: task.task_id,
    task_spec_hash: agreement.task_spec_hash,
    missed_deadline: !deliverableExists,
    contracted_penalty_micro_usdc: task.contracted_penalty_micro_usdc,
    deliverable_path: task.deliverable_path,
    deliverable_present_at_deadline: deliverableExists,
    observed_at: observedAt,
    observation_mode: "CONTROLLED_COVRA_TESTNET_TESTBED",
    source_provenance: "Public GitHub Actions workflow in the COVRA repository; COVRA controls the repository, workflow and task observer.",
    operator_independence: "NOT_VERIFIED",
    external_counterparty: false,
    penalty_status: "TESTNET_ACCOUNTING_ONLY_NO_COMMERCIAL_PENALTY",
  },
};
const outputPath = resolve(root, argument("--output", `testbed/class0/observations/${observationId}.json`));
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(observation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath: outputPath.replace(`${root}\\`, ""), observationId, eventTime: task.deadline, observedAt, missedDeadline: !deliverableExists }, null, 2));
