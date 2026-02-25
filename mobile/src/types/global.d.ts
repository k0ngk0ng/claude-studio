/**
 * Type declarations for Web APIs polyfilled in React Native.
 *
 * React Native's TypeScript config does not include "dom" lib to avoid
 * exposing browser-only APIs (window, document, etc.). These declarations
 * cover only the globals that are actually polyfilled at runtime:
 *   - TextEncoder / TextDecoder (via react-native's built-in polyfill)
 *   - btoa / atob (react-native global)
 *   - crypto.getRandomValues (via react-native-get-random-values)
 */

// --- Encoding ---

declare class TextEncoder {
  readonly encoding: string;
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  readonly encoding: string;
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input?: ArrayBufferView | ArrayBuffer, options?: { stream?: boolean }): string;
}

// --- Base64 ---

declare function btoa(data: string): string;
declare function atob(data: string): string;

// --- Crypto (subset polyfilled by react-native-get-random-values) ---

declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};
