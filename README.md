# Proof of Reserves Verifier

独立验证用户资产是否包含在指定的 Merkle Root 中。验证过程在本地完成，不请求交易所接口，不上传证明文件。

## 环境

- Node.js 20 或更高版本
- 无第三方依赖

## 使用

下载个人证明文件后执行：

```bash
node verify.mjs ./por-proof-2026-07.json
```

建议同时传入储备金披露页面展示的 Merkle Root：

```bash
node verify.mjs ./por-proof-2026-07.json --root <published-root-hash>
```

使用仓库内的匿名示例：

```bash
node verify.mjs ./examples/por-proof-example.json \
  --root add3965d6c7bca2a54dd23f6c882322292476f55def700589ae7dcc706bdbecb
```

退出码：

- `0`：验证成功
- `1`：Hash 验证失败
- `2`：文件或参数格式错误

## 验证规则

算法版本为 `POR_V1`。

叶子节点原文：

```text
POR_V1|auditId={auditId}|recordId={recordId}|BTC={BTC}|ETH={ETH}|USDT={USDT}|USDC={USDC}
```

余额固定保留 8 位小数，币种顺序固定为 `BTC、ETH、USDT、USDC`。

计算叶子节点：

```text
leafHash = SHA256(leafPayload)
```

按证明文件中的节点顺序计算：

```text
position=LEFT:  currentHash = SHA256(node.hash + currentHash)
position=RIGHT: currentHash = SHA256(currentHash + node.hash)
```

最终 `currentHash` 必须同时等于证明文件的 `rootHash` 和储备金披露页面展示的 Merkle Root。

## 浏览器接入

`src/verify.mjs` 使用 Web Crypto，可以直接在前端项目中调用：

```javascript
import { verifyProof } from "./src/verify.mjs";

const result = await verifyProof(proofData, {
  expectedRootHash: publishedRootHash
});

if (result.success) {
  console.log("验证成功");
} else {
  console.log("验证失败", result.checks);
}
```

## 测试

```bash
npm test
```

示例文件只包含匿名测试数据，不能替代真实用户下载的证明文件。
