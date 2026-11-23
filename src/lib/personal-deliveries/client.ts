export type PersonalDelivery = { id: string; title: string; done: boolean };

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      payload.message ?? "Não foi possível salvar a tarefa pessoal.",
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function listPersonalDeliveries(): Promise<PersonalDelivery[]> {
  return request("/api/personal-deliveries");
}

export function createPersonalDelivery(title: string): Promise<PersonalDelivery> {
  return request("/api/personal-deliveries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export function updatePersonalDelivery(
  id: string,
  done: boolean,
): Promise<PersonalDelivery> {
  return request(`/api/personal-deliveries/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ done }),
  });
}

export function deletePersonalDelivery(id: string): Promise<void> {
  return request(`/api/personal-deliveries/${id}`, { method: "DELETE" });
}
