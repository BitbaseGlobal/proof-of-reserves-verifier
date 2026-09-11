# Proof of Reserves Verifier

English | [简体中文](README.zh-CN.md)

Independently verify that a user's assets are included in a specified Merkle Root. Verification runs entirely on your local machine: it does not call exchange APIs or upload proof files.

## Requirements

- Node.js 20 or later
- No third-party dependencies

## Usage

After downloading your personal proof file, run:

```bash
node verify.mjs ./por-proof-2026-07.json
```

We recommend also providing the Merkle Root shown on the Proof of Reserves disclosure page:

```bash
node verify.mjs ./por-proof-2026-07.json --root <published-root-hash>
```

To verify the anonymous example included in this repository, run:

```bash
node verify.mjs ./examples/por-proof-example.json \
  --root add3965d6c7bca2a54dd23f6c882322292476f55def700589ae7dcc706bdbecb
```

Exit codes:

- `0`: Verification succeeded
- `1`: Hash verification failed
- `2`: Invalid file or argument format

## Verification Rules

The algorithm version is `POR_V1`.

Leaf payload:

```text
POR_V1|auditId={auditId}|recordId={recordId}|BTC={BTC}|ETH={ETH}|USDT={USDT}|USDC={USDC}
```

Balances always use 8 decimal places, and the currency order is fixed as `BTC, ETH, USDT, USDC`.

Calculate the leaf hash:

```text
leafHash = SHA256(leafPayload)
```

Process each proof node in the order provided by the proof file:

```text
position=LEFT:  currentHash = SHA256(node.hash + currentHash)
position=RIGHT: currentHash = SHA256(currentHash + node.hash)
```

The final `currentHash` must match both the `rootHash` in the proof file and the Merkle Root shown on the Proof of Reserves disclosure page.

## Browser Integration

`src/verify.mjs` uses the Web Crypto API and can be imported directly into a frontend project:

```javascript
import { verifyProof } from "./src/verify.mjs";

const result = await verifyProof(proofData, {
  expectedRootHash: publishedRootHash
});

if (result.success) {
  console.log("Verification succeeded");
} else {
  console.log("Verification failed", result.checks);
}
```

## Testing

```bash
npm test
```

The example file contains anonymous test data only and is not a substitute for a proof file downloaded by an actual user.
