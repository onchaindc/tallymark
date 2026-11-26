/**
 * Base Sepolia exact-scheme settlement using @x402 + viem.
 * Private key only from TELEGRAPH_PRIVATE_KEY / TALLYMARK_PRIVATE_KEY.
 * Never logs the key.
 */
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { encodePaymentSignatureHeader } from '@x402/core/http';

const BASE_RPC = process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';

export function createExactBaseSepoliaSettle() {
  const key = process.env.TELEGRAPH_PRIVATE_KEY || process.env.TALLYMARK_PRIVATE_KEY;
  if (!key || !key.startsWith('0x')) {
    throw new Error('TELEGRAPH_PRIVATE_KEY required for settle');
  }
  const account = privateKeyToAccount(key);
  const client = new x402Client();
  registerExactEvmScheme(client, {
    signer: account,
    schemeOptions: { 84532: { rpcUrl: BASE_RPC } },
    networks: ['eip155:84532'],
  });

  return async function settle({ challenge, selected, validated, priceUsd }) {
    const accepts = challenge.accepts || challenge.raw?.accepts || (selected ? [selected] : []);
    const paymentRequired = {
      x402Version: 2,
      accepts,
      error: challenge.error || 'Payment required',
      resource: challenge.resource || challenge.raw?.resource,
    };
    const payload = await client.createPaymentPayload(paymentRequired);
    const header = encodePaymentSignatureHeader(payload);
    return {
      headers: { 'PAYMENT-SIGNATURE': header },
      receipt: {
        scheme: validated?.scheme || selected?.scheme || 'exact',
        network: validated?.network || selected?.network || 'eip155:84532',
        amount: validated?.amount || selected?.amount || '10000',
        payTo: validated?.payTo || selected?.payTo,
        amountUsd: priceUsd,
        payer: account.address,
        proof: 'x402-payment-signature-header',
        signature: header.slice(0, 32) + '…',
      },
    };
  };
}
