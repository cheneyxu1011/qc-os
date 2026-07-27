export type PeopleDepartment = {
  id: string;
  name: string;
};

export type PeoplePerson = {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  active: boolean;
};

export async function fetchPeopleDepartments(): Promise<PeopleDepartment[]> {
  const baseUrl = process.env.PEOPLE_OS_API_BASE_URL;
  if (!baseUrl) return [];

  const response = await fetch(`${baseUrl}/api/people/departments`, {
    headers: process.env.PEOPLE_OS_API_KEY ? { Authorization: `Bearer ${process.env.PEOPLE_OS_API_KEY}` } : undefined,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`People OS department lookup failed: ${response.status}`);
  }

  return response.json();
}

