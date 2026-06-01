import { invoke } from '@tauri-apps/api/core';

interface TestCase {
  input: string;
  expected_output: string;
  actual_output: string;
  passed: boolean;
  time_ms: number;
}

interface ProblemInfo {
  name: string;
  time_limit_ms: number;
  memory_limit_mb: number;
  testcases: TestCase[];
}

export function initCPH() {
  console.log('[CPH] Competitive Companion module loaded');
}

export async function parseProblem(json: string): Promise<ProblemInfo> {
  return invoke('parse_problem', { json });
}

export async function runTestcases(code: string, testcases: [string, string][]): Promise<TestCase[]> {
  return invoke('run_testcases', { code, testcases });
}
