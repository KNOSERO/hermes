export async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Błąd HTTP ${response.status}`);
  return result;
}
