export type SupportedChain = 'polygon' | 'gnosis';

export interface YieldSnapshot {
  chain: SupportedChain;
  protocol: 'aave' | 'spark';
  aprBps: number;
  timestamp: number;
}
