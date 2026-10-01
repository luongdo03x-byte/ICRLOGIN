import { z } from 'zod';

export const ProxyTypeSchema = z.enum(['http', 'https', 'socks5']);
export type ProxyType = 'http' | 'https' | 'socks5';

export const CreateProxyInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: ProxyTypeSchema,
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().max(512).nullable().optional(),
  password: z.string().max(2048).nullable().optional()
});

export const UpdateProxyInputSchema = CreateProxyInputSchema.partial();

export type CreateProxyInput = z.infer<typeof CreateProxyInputSchema>;
export type UpdateProxyInput = z.infer<typeof UpdateProxyInputSchema>;

export interface Proxy {
  id: string;
  name: string;
  type: ProxyType;
  host: string;
  port: number;
  username: string | null;
  encryptedPassword: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProxyPublic {
  id: string;
  name: string;
  type: ProxyType;
  host: string;
  port: number;
  username: string | null;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}
