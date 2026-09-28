import { describe, expect, it } from 'vitest';
import { IcrClientError, unwrapEnvelope } from '../../src/renderer/src/api/icr-client.js';
describe('icr-client',()=>{it('unwraps success and throws renderer-safe typed errors',()=>{expect(unwrapEnvelope({ok:true,data:42})).toBe(42);let caught:unknown;try{unwrapEnvelope({ok:false,error:{code:'INVALID_REQUEST',message:'Bad input'}});}catch(error){caught=error;}expect(caught instanceof IcrClientError).toBe(true);expect((caught as IcrClientError).code).toBe('INVALID_REQUEST');});});
