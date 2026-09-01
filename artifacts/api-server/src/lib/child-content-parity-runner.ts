import { isValidChildContent } from "./child-content-validator";

type Payload = {
  baseContent: Record<string, unknown>;
  cases: Array<{
    name: string;
    changes: Array<{ path: Array<string | number>; value: unknown }>;
  }>;
};

function resolveValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.repeat === "string" && Number.isInteger(candidate.count) && (candidate.count as number) >= 0) {
      return candidate.repeat.repeat(candidate.count as number);
    }
    return Object.fromEntries(Object.entries(candidate).map(([key, item]) => [key, resolveValue(item)]));
  }
  if (Array.isArray(value)) return value.map(resolveValue);
  return value;
}

function applyChanges(base: Record<string, unknown>, changes: Payload["cases"][number]["changes"]): Record<string, unknown> {
  const content = structuredClone(base);
  for (const change of changes) {
    let target: unknown = content;
    for (const segment of change.path.slice(0, -1)) {
      if (!target || typeof target !== "object") throw new Error(`Invalid parity path in ${change.path.join(".")}`);
      target = (target as Record<string | number, unknown>)[segment];
    }
    if (!target || typeof target !== "object" || change.path.length === 0) {
      throw new Error(`Invalid parity path in ${change.path.join(".")}`);
    }
    (target as Record<string | number, unknown>)[change.path.at(-1)!] = resolveValue(change.value);
  }
  return content;
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const payload = JSON.parse(input) as Payload;
const results = payload.cases.map((testCase) => ({
  name: testCase.name,
  valid: isValidChildContent(applyChanges(payload.baseContent, testCase.changes)),
}));
process.stdout.write(JSON.stringify(results));