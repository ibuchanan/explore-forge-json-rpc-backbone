import { verifyDeployed } from "./verify.ts";

const report = await verifyDeployed(process.env, (url, init) =>
  fetch(url, init),
);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === "passed" ? 0 : 1;
