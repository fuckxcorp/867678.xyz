const requests = new Map<string, Promise<string>>();

const describeError = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const code = (error.cause as { code?: string } | undefined)?.code;
  if (code) return code;
  return error.name === "Error"
    ? error.message
    : `${error.name}: ${error.message}`;
};

async function load(url: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        throw new Error(
          response.statusText
            ? `${response.status} ${response.statusText}`
            : String(response.status),
        );
      }

      const markdown = await response.text();
      console.info(`✓ ${url} (${Date.now() - startedAt}ms)`);
      return markdown;
    } catch (error) {
      lastError = error;
      const retrying = attempt < 3;
      console.warn(
        `✗ ${url} attempt ${attempt}/3 failed (${describeError(error)})${retrying ? ", retrying" : ""}`,
      );
      if (retrying) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  throw new Error(`Failed to load Markdown from ${url}`, {
    cause: lastError,
  });
}

export function getMd(url: string): Promise<string> {
  const pending = requests.get(url) ?? load(url);
  requests.set(url, pending);
  return pending;
}
