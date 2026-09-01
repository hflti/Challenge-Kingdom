import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

type Contract = {
  baseContent: Record<string, unknown>;
  cases: Array<{
    name: string;
    expected: boolean;
    changes: Array<{ path: Array<string | number>; value: unknown }>;
  }>;
};

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const contractPath = path.resolve(workspaceRoot, "artifacts/challenge-kingdom/public/child-content-contract.json");
const phpRunnerPath = path.resolve(workspaceRoot, "artifacts/challenge-kingdom/scripts/child-content-parity.php");
const nodeRunnerPath = path.resolve(workspaceRoot, "artifacts/api-server/src/lib/child-content-parity-runner.ts");
const tsxPath = path.resolve(workspaceRoot, "scripts/node_modules/.bin/tsx");
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as Contract;
const input = JSON.stringify({ baseContent: contract.baseContent, cases: contract.cases });
const node = spawnSync(tsxPath, [nodeRunnerPath], { input, encoding: "utf8", cwd: workspaceRoot });
if (node.error) throw node.error;
if (node.status !== 0) {
  throw new Error(`Node parity runner failed (${node.status}): ${node.stderr}`);
}
const nodeResults = JSON.parse(node.stdout) as Array<{ name: string; valid: boolean }>;
const php = spawnSync("php", [phpRunnerPath], {
  input,
  encoding: "utf8",
  cwd: workspaceRoot,
});
if (php.error) throw php.error;
if (php.status !== 0) {
  throw new Error(`PHP parity runner failed (${php.status}): ${php.stderr}`);
}
const phpResults = JSON.parse(php.stdout) as typeof nodeResults;
const failures: string[] = [];
for (let index = 0; index < contract.cases.length; index += 1) {
  const testCase = contract.cases[index];
  const nodeResult = nodeResults[index];
  const phpResult = phpResults[index];
  if (!phpResult || nodeResult.valid !== phpResult.valid || nodeResult.valid !== testCase.expected) {
    failures.push(`${testCase.name}: expected=${testCase.expected}, node=${nodeResult.valid}, php=${phpResult?.valid ?? "missing"}`);
  }
}
if (phpResults.length !== nodeResults.length) {
  failures.push(`result count: expected=${nodeResults.length}, php=${phpResults.length}`);
}
if (failures.length > 0) {
  throw new Error(`Child-content parity check failed:\n${failures.join("\n")}`);
}
console.log(`Child-content parity check passed: ${nodeResults.length} shared cases.`);