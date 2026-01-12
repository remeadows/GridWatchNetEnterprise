/**
 * Type definitions for net-snmp
 */

declare module "net-snmp" {
  export const Version1: number;
  export const Version2c: number;
  export const Version3: number;

  export const SecurityLevel: {
    noAuthNoPriv: number;
    authNoPriv: number;
    authPriv: number;
  };

  export const AuthProtocols: {
    md5: number;
    sha: number;
    sha224: number;
    sha256: number;
    sha384: number;
    sha512: number;
  };

  export const PrivProtocols: {
    des: number;
    aes: number;
    aes192: number;
    aes256: number;
  };

  export interface UserOptions {
    name: string;
    level: number;
    authProtocol?: number;
    authKey?: string;
    privProtocol?: number;
    privKey?: string;
  }

  export interface SessionOptions {
    port?: number;
    retries?: number;
    timeout?: number;
    version?: number;
    transport?: string;
    trapPort?: number;
    idBitsSize?: number;
  }

  export interface VarBind {
    oid: string;
    type: number;
    value: unknown;
  }

  export interface Session {
    get(
      oids: string[],
      callback: (error: Error | null, varbinds: VarBind[]) => void,
    ): void;
    getNext(
      oids: string[],
      callback: (error: Error | null, varbinds: VarBind[]) => void,
    ): void;
    getBulk(
      oids: string[],
      nonRepeaters: number,
      maxRepetitions: number,
      callback: (error: Error | null, varbinds: VarBind[]) => void,
    ): void;
    set(
      varbinds: VarBind[],
      callback: (error: Error | null, varbinds: VarBind[]) => void,
    ): void;
    walk(
      oid: string,
      maxRepetitions: number,
      feedCallback: (varbinds: VarBind[]) => boolean,
      doneCallback: (error: Error | null) => void,
    ): void;
    subtree(
      oid: string,
      maxRepetitions: number,
      feedCallback: (varbinds: VarBind[]) => void,
      doneCallback: (error: Error | null) => void,
    ): void;
    table(
      oid: string,
      maxRepetitions: number,
      callback: (error: Error | null, table: Record<string, unknown>) => void,
    ): void;
    close(): void;
    on(event: string, callback: (error: Error) => void): void;
  }

  export function createSession(
    target: string,
    community: string,
    options?: SessionOptions,
  ): Session;

  export function createV3Session(
    target: string,
    user: UserOptions,
    options?: SessionOptions,
  ): Session;

  export function isVarbindError(varbind: VarBind): boolean;
  export function varbindError(varbind: VarBind): string;
}
