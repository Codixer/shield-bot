import fetch from "node-fetch";

export async function purgeCloudflareCache(zoneId: string, apiToken: string, urls: string[]) {
  const endpoint = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ files: urls }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare purge failed: ${res.status} ${text}`);
  }
  return res.json();
}
