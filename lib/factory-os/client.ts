export type FactoryStyle = {
  id: string;
  brand: string;
  styleNo: string;
  color?: string;
};

export async function searchFactoryStyles(keyword: string): Promise<FactoryStyle[]> {
  const baseUrl = process.env.FACTORY_OS_API_BASE_URL;
  if (!baseUrl) return [];

  const response = await fetch(`${baseUrl}/api/factory/styles?keyword=${encodeURIComponent(keyword)}`, {
    headers: process.env.FACTORY_OS_API_KEY ? { Authorization: `Bearer ${process.env.FACTORY_OS_API_KEY}` } : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Factory OS style lookup failed: ${response.status}`);
  }

  return response.json();
}

