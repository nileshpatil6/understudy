import { runEval, summarize } from "../src/eval/run.js";
import { reflect } from "../src/reflect/run.js";
import type { Item } from "../src/types.js";

/** eval -> reflect -> eval ... N times. This produces the chart. */
const source = (process.env.SOURCE ?? "gmail") as Item["source"];
const rounds = Number(process.env.ROUNDS ?? 5);
const privateData = process.env.PRIVATE === "1";
const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

for (let i = 0; i < rounds; i++) {
  const r = await runEval({ source, limit, privateData });
  console.log(summarize(r));
  if (i < rounds - 1) {
    const ref = await reflect({ source, privateData });
    console.log(`  reflect: ${ref.misses} misses -> +${ref.added} rules`);
  }
}
