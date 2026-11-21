export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RequestJsonErrorOptions = {
  fallbackMessage: string;
  createError: (status: number, message: string) => Error;
};

export function jsonRequest(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init: RequestInit | undefined,
  options: RequestJsonErrorOptions,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    let message = options.fallbackMessage;
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // A mensagem padrão também cobre respostas sem JSON.
    }
    throw options.createError(response.status, message);
  }
  return (await response.json()) as T;
}

export function createChangeChannel(eventName: string): {
  notify: () => void;
  observe: (onchange: () => void) => () => void;
} {
  return {
    notify() {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(eventName));
      }
    },
    observe(onchange) {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener(eventName, onchange);
      return () => window.removeEventListener(eventName, onchange);
    },
  };
}
