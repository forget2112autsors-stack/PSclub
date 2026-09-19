const TOKEN_KEY = 'psklub.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* brauzer saqlashni bloklagan — sessiya faqat shu sahifada qoladi */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    // TZ 7.3: aloqa yo'qligi aniq aytiladi, amal bajarilmagan hisoblanadi.
    throw new ApiError('Aloqa yo\'q — amal bajarilmadi.', 0);
  }

  if (response.status === 401) {
    setToken(null);
    throw new ApiError('Sessiya tugadi — qaytadan kiring.', 401);
  }

  let body: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== 204) {
    if (contentType.includes('application/json')) {
      body = await response.json().catch(() => null);
    } else {
      const text = await response.text().catch(() => '');
      body = { error: text.trim().slice(0, 300) || response.statusText };
    }
  }

  if (!response.ok) {
    const errObj = body as { error?: string; message?: string } | null;
    const message = errObj?.message ?? errObj?.error ?? `Server xatosi (${response.status}): ${response.statusText || 'noma\'lum xatolik'}`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}
