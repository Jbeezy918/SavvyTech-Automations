import type { SopsyncApi } from '@shared/ipc';

declare global {
  interface Window {
    sopsync: SopsyncApi;
  }
}

export {};
