import { z } from "zod";
import {
  abortError,
  createTransport,
  ProviderError,
  withSignal,
} from "./transport.ts";
import type { RuntimeOptions } from "./types.ts";

export interface EbayCredentials {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
}
interface Token {
  value: string;
  expiresAt: number;
  managed: boolean;
}
const tokenSchema = z.object({
  access_token: z.string().min(1).max(8192),
  expires_in: z.number().positive().finite().max(31_536_000),
  token_type: z.string().optional(),
});

export function createEbayTokenManager(
  credentials: EbayCredentials,
  options: RuntimeOptions = {},
) {
  const transport = createTransport(options);
  const managed = !!credentials.clientId && !!credentials.clientSecret;
  let cached: Token | null = null;
  let pending: Promise<Token> | null = null;

  async function mint(): Promise<Token> {
    // A mint is shared: the first search's cancellation must not cancel other waiters.
    const signal = AbortSignal.timeout(
      Math.min(options.timeoutMs ?? 10000, 10000),
    );
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    });
    const result = await transport.json(
      "https://api.ebay.com/identity/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
      {
        signal,
        requests: 0,
        maxRequests: 2,
        deadlineAt: transport.now() + 10000,
      },
    );
    const parsed = tokenSchema.safeParse(result);
    if (!parsed.success) throw new ProviderError("invalid_response");
    const ttl = parsed.data.expires_in * 1000;
    cached = {
      value: parsed.data.access_token,
      managed: true,
      expiresAt: transport.now() + ttl - Math.min(ttl * 0.1, 60000),
    };
    return cached;
  }

  return {
    configured: () => managed || !!credentials.accessToken,
    async get(signal: AbortSignal): Promise<Token> {
      if (signal.aborted) throw abortError(signal);
      if (!managed) {
        if (!credentials.accessToken) throw new ProviderError("not_configured");
        if (signal.aborted)
          return withSignal(
            Promise.resolve({
              value: credentials.accessToken,
              managed: false,
              expiresAt: 0,
            }),
            signal,
          );
        return { value: credentials.accessToken, managed: false, expiresAt: 0 };
      }
      if (cached && cached.expiresAt > transport.now())
        return withSignal(Promise.resolve(cached), signal);
      if (!pending) {
        pending = mint().finally(() => {
          pending = null;
        });
      }
      return withSignal(pending, signal);
    },
    invalidate(rejectedValue: string) {
      // A delayed 401 from an old request must not evict a newer token generation.
      if (cached?.value === rejectedValue) cached = null;
    },
  };
}
