export type PersonalTask = { id: string; title: string; done: boolean };

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

export function listPersonalTasks(): Promise<PersonalTask[]> {
  return request("/api/personal-tasks");
}

export function createPersonalTask(title: string): Promise<PersonalTask> {
  return request("/api/personal-tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export function updatePersonalTask(
  id: string,
  done: boolean,
): Promise<PersonalTask> {
  return request(`/api/personal-tasks/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ done }),
  });
}

export function deletePersonalTask(id: string): Promise<void> {
  return request(`/api/personal-tasks/${id}`, { method: "DELETE" });
}
