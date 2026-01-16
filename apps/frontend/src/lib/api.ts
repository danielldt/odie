import { useAuthStore } from "../stores/auth";

const API_BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/v1` 
  : "/api/v1";

class ApiClient {
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    const token = useAuthStore.getState().accessToken;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.status === 401) {
      // Try to refresh token
      const refreshed = await this.refreshToken();
      if (!refreshed) {
        useAuthStore.getState().logout();
        window.location.href = "/login";
        throw new Error("Session expired");
      }
      throw new Error("Token refreshed, please retry");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Request failed" }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  private async refreshToken(): Promise<boolean> {
    const { refreshToken, updateTokens, logout } = useAuthStore.getState();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        logout();
        return false;
      }

      const data = await response.json();
      updateTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      logout();
      return false;
    }
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: this.getHeaders(),
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    return this.handleResponse<T>(response);
  }
}

export const api = new ApiClient();

// Auth API
export const authApi = {
  register: (email: string, password: string) =>
    api.post<{ user: { id: string; email: string }; accessToken: string; refreshToken: string }>(
      "/auth/register",
      { email, password }
    ),

  login: (email: string, password: string) =>
    api.post<{ user: { id: string; email: string }; accessToken: string; refreshToken: string }>(
      "/auth/login",
      { email, password }
    ),

  logout: (refreshToken: string) =>
    api.post("/auth/logout", { refreshToken }),
};

// Strategies API
export const strategiesApi = {
  list: () => api.get<{ strategies: unknown[] }>("/strategies"),
  get: (id: string) => api.get<{ strategy: unknown }>(`/strategies/${id}`),
  create: (data: unknown) => api.post<{ strategy: unknown }>("/strategies", data),
  update: (id: string, data: unknown) => api.patch<{ strategy: unknown }>(`/strategies/${id}`, data),
  delete: (id: string) => api.delete(`/strategies/${id}`),
  runNow: (id: string) => api.post(`/strategies/${id}/run-now`),
};

// Markets API
export const marketsApi = {
  list: (params?: { search?: string; active?: boolean; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.active !== undefined) searchParams.set("active", String(params.active));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const query = searchParams.toString();
    return api.get<{ markets: unknown[]; total: number }>(`/markets${query ? `?${query}` : ""}`);
  },
  get: (id: string) => api.get<{ market: unknown }>(`/markets/${id}`),
};

// Runs API
export const runsApi = {
  list: (params?: { strategyId?: string; status?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.strategyId) searchParams.set("strategyId", params.strategyId);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const query = searchParams.toString();
    return api.get<{ runs: unknown[]; total: number }>(`/runs${query ? `?${query}` : ""}`);
  },
  get: (id: string) => api.get<{ run: unknown }>(`/runs/${id}`),
};

// PnL API
export const pnlApi = {
  daily: (params?: { marketId?: string; startDate?: string; endDate?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.marketId) searchParams.set("marketId", params.marketId);
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);
    const query = searchParams.toString();
    return api.get<{ records: unknown[] }>(`/pnl/daily${query ? `?${query}` : ""}`);
  },
  summary: (params?: { marketId?: string; startDate?: string; endDate?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.marketId) searchParams.set("marketId", params.marketId);
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);
    const query = searchParams.toString();
    return api.get<{ summary: unknown }>(`/pnl/summary${query ? `?${query}` : ""}`);
  },
};

// Credentials API
export const credentialsApi = {
  status: () => api.get<{ hasCredentials: boolean; credentialId?: string; walletId?: string }>("/credentials/polymarket"),
  store: (data: { walletId: string; apiKey: string; apiSecret: string; passphrase: string }) =>
    api.post("/credentials/polymarket", data),
  revoke: (id: string) => api.delete(`/credentials/${id}`),
};

// Wallets API
export const walletsApi = {
  list: () => api.get<{ wallets: unknown[] }>("/wallets"),
  verify: (data: { address: string; chainId: number; message: string; signature: string }) =>
    api.post<{ wallet: unknown }>("/wallets/verify", data),
};
