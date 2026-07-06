// Lazy-loaded zxcvbn wrapper. The library ships ~140KB of dictionaries so we
// keep it out of the initial bundle and load it on demand the first time a
// passphrase field asks for a score.

import type { ZxcvbnResult } from "@zxcvbn-ts/core";

export interface PassphraseScore {
  /** 0 (weakest) – 4 (strongest). */
  score: 0 | 1 | 2 | 3 | 4;
  warning: string;
  suggestions: string[];
  /** Best-effort human-readable "crack time in an online throttled attack". */
  crackTime: string;
}

let readyPromise: Promise<(pw: string) => ZxcvbnResult> | null = null;

async function getEvaluator() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const [core, common, en] = await Promise.all([
      import("@zxcvbn-ts/core"),
      import("@zxcvbn-ts/language-common"),
      import("@zxcvbn-ts/language-en"),
    ]);
    core.zxcvbnOptions.setOptions({
      translations: en.translations,
      graphs: common.adjacencyGraphs,
      dictionary: {
        ...common.dictionary,
        ...en.dictionary,
      },
    });
    return (pw: string) => core.zxcvbn(pw);
  })();
  return readyPromise;
}

/** Warm the dictionaries in the background — cheap to call multiple times. */
export function preloadZxcvbn() {
  void getEvaluator();
}

export async function evaluatePassphrase(pw: string): Promise<PassphraseScore> {
  if (!pw) {
    return { score: 0, warning: "", suggestions: [], crackTime: "" };
  }
  const evaluate = await getEvaluator();
  const result = evaluate(pw);
  return {
    score: result.score as 0 | 1 | 2 | 3 | 4,
    warning: result.feedback.warning ?? "",
    suggestions: result.feedback.suggestions ?? [],
    crackTime: String(
      result.crackTimesDisplay.onlineThrottling100PerHour ?? "",
    ),
  };
}
