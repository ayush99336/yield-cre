export const vaultAbi = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [{ name: 'amount', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [{ name: 'shares', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

export const homeVaultAddress =
  process.env.NEXT_PUBLIC_HOME_VAULT_ADDRESS ??
  '0x1111111111111111111111111111111111111111'
