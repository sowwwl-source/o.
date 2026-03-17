import process from "node:process";
import { resolveBuildId, resolveBuildTime, runViteBuild, writeBuildArtifacts } from "./build-meta.mjs";

const env = {
  ...process.env,
  VITE_BUILD_ID: resolveBuildId(process.env),
  VITE_BUILD_TIME: resolveBuildTime(process.env),
};

runViteBuild(env);
await writeBuildArtifacts({ env });
