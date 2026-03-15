export async function loadJsonConfig<T>(
  url: string,
  fallbackConfig: T,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  try {
    const response = await fetchImpl(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Failed to load config from ${url}`);
    }
    return (await response.json()) as T;
  } catch (_error) {
    return fallbackConfig;
  }
}
