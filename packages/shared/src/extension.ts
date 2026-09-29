import { z } from 'zod';

export const ExtensionSourceTypeSchema = z.enum(['unpacked', 'crx']);
export type ExtensionSourceType = 'unpacked' | 'crx';

export interface ExtensionRecord {
  id: string;
  name: string;
  version: string;
  sourceType: ExtensionSourceType;
  enabled: boolean;
  profileCount: number;
  groupCount: number;
  createdAt: string;
  updatedAt: string;
}
