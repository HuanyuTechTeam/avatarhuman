export async function loadJsonConfig(url, fallbackConfig, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Failed to load config from ${url}`);
    }
    return await response.json();
  } catch (_error) {
    return fallbackConfig;
  }
}
