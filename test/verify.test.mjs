import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ProofFormatError, verifyProof } from "../src/verify.mjs";

const fixtureUrl = new URL("../examples/por-proof-example.json", import.meta.url);

async function loadFixture() {
    return JSON.parse(await readFile(fileURLToPath(fixtureUrl), "utf8"));
}

test("有效证明验证成功", async () => {
    const document = await loadFixture();
    const result = await verifyProof(document, { expectedRootHash: document.rootHash });

    assert.equal(result.success, true);
    assert.deepEqual(result.checks, {
        leafPayload: true,
        leafHash: true,
        merkleRoot: true,
        publishedRoot: true
    });
});

test("Proof 节点被修改后验证失败", async () => {
    const document = await loadFixture();
    document.proof[0].hash = "0".repeat(64);
    const result = await verifyProof(document, { expectedRootHash: document.rootHash });

    assert.equal(result.success, false);
    assert.equal(result.checks.leafPayload, true);
    assert.equal(result.checks.leafHash, true);
    assert.equal(result.checks.merkleRoot, false);
    assert.equal(result.checks.publishedRoot, false);
});

test("余额被修改后验证失败", async () => {
    const document = await loadFixture();
    document.balances.USDT = "101.00000000";
    const result = await verifyProof(document);

    assert.equal(result.success, false);
    assert.equal(result.checks.leafPayload, false);
    assert.equal(result.checks.leafHash, false);
    assert.equal(result.checks.merkleRoot, false);
});

test("非法 Proof 位置被拒绝", async () => {
    const document = await loadFixture();
    document.proof[0].position = "MIDDLE";

    await assert.rejects(() => verifyProof(document), ProofFormatError);
});
