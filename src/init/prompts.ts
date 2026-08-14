/// <reference types="node" />
import { createInterface, type Interface } from "node:readline/promises";

export interface HubAnswer {
  repo: string;
  branch: string;
}

export interface InitAnswers {
  project?: string;
  org?: string;
  locale: string;
  hub: HubAnswer | null;
}

const DEFAULT_LOCALE = "en";
const DEFAULT_HUB_BRANCH = "main";

export async function askInteractive(known: Partial<InitAnswers>): Promise<InitAnswers> {
  const rl = process.stdin.isTTY === true
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;

  const resolve = async (
    value: string | undefined,
    question: string,
    fallback?: string,
  ): Promise<string | undefined> => {
    if (value !== undefined) return value;
    if (!rl) return fallback;
    const answer = (await rl.question(question)).trim();
    return answer || fallback;
  };

  try {
    const project = await resolve(known.project, "Project name: ");
    const org = await resolve(known.org, "GitHub org / owner: ");
    const locale = (await resolve(
      known.locale,
      `Docs locale [${DEFAULT_LOCALE}]: `,
      DEFAULT_LOCALE,
    )) as string;
    const hub = known.hub !== undefined ? known.hub : await resolveHub(rl);

    return { project, org, locale, hub };
  } finally {
    rl?.close();
  }
}

async function resolveHub(rl: Interface | null): Promise<HubAnswer | null> {
  // ponytail: hub connection is opt-in infra — no TTY (the caller already
  // resolved flag-provided values before calling us) means "local-only",
  // never a missing-required-value failure the way project/org are.
  if (!rl) return null;

  const answer = (await rl.question("Connect this wiki to a hub repo? (y/N): ")).trim();
  if (!/^y(es)?$/i.test(answer)) return null;

  const repo = (await rl.question("Hub repo (owner/name): ")).trim();
  const branch = (await rl.question(`Hub branch [${DEFAULT_HUB_BRANCH}]: `)).trim() || DEFAULT_HUB_BRANCH;
  return { repo, branch };
}
