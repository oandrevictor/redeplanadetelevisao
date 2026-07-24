import { simulateSeasons } from "../game/simulator";

const requested = Number.parseInt(process.argv[2] ?? "1000", 10);
const seasons = Number.isFinite(requested) && requested > 0 ? requested : 1000;
const report = simulateSeasons(seasons);
console.log(JSON.stringify(report, null, 2));
if (report.deadlocks > 0 || report.invariantFailures > 0 || report.completed !== seasons) process.exitCode = 1;
