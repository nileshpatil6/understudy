import { runEval, summarize } from "../src/eval/run.js";
import { reflect, describe } from "../src/reflect/run.js";
import { shutdownTracing } from "../src/agent/llm.js";
import type { Item } from "../src/types.js";

/** eval -> reflect -> eval ... N times. This produces the chart. */
const source = (process.env.SOURCE ?? "gmail") as Item["source"];
const rounds = Number(process.env.ROUNDS ?? 5);
const privateData = process.env.PRIVATE === "1";
const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
/** also score the held-out set every round; the reflector never sees it */
const withTest = process.env.TEST !== "0";

for (let i = 0; i < rounds; i++) {
  const r = await runEval({ source, limit, privateData, split: "train" });
  console.log(summarize(r));
  if (withTest) {
    try {
      const t = await runEval({ source, privateData, split: "test" });
      console.log(summarize(t));
    } catch (e) {
      console.log(`  (no test split: ${(e as Error).message.split("\n")[0]})`);
    }
  }
  if (i < rounds - 1) {
    const ref = await reflect({ source, privateData });
    console.log(describe(ref));
  }
}
await shutdownTracing();
