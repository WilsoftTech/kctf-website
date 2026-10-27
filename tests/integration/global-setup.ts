import type { TestProject } from "vitest/node";
import { startTestDatabase } from "../support/test-database";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const { url, stop } = await startTestDatabase();
  project.provide("testDatabaseUrl", url);
  return stop;
}
