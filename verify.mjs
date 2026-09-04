#!/usr/bin/env node

import { webcrypto } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ProofFormatError, verifyProof } from "./src/verify.mjs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

if (globalThis.crypto === undefined) {
    globalThis.crypto = webcrypto;
}

function printUsage() {
    console.log("用法: node verify.mjs <proof.json> [--root <publishedRootHash>]");
}

function parseArguments(args) {
    if (args.length === 0) {
        throw new ProofFormatError("缺少证明文件路径");
    }
    const result = { filePath: args[0], expectedRootHash: undefined };
    for (let index = 1; index < args.length; index += 1) {
        const item = args[index];
        if (item === "--root" && index + 1 < args.length) {
            result.expectedRootHash = args[index + 1];
            index += 1;
        } else if (item.startsWith("--root=")) {
            result.expectedRootHash = item.slice("--root=".length);
        } else {
            throw new ProofFormatError(`不支持的参数: ${item}`);
        }
    }
    return result;
}

function printCheck(name, value) {
    if (value === null) {
        console.log(`[SKIP] ${name}`);
        return;
    }
    console.log(`[${value ? "PASS" : "FAIL"}] ${name}`);
}

async function main() {
    try {
        const { filePath, expectedRootHash } = parseArguments(process.argv.slice(2));
        const fileInfo = await stat(filePath);
        if (fileInfo.isFile() === false || fileInfo.size <= 0 || fileInfo.size > MAX_FILE_SIZE) {
            throw new ProofFormatError(`证明文件必须是大小 1-${MAX_FILE_SIZE} 字节的普通文件`);
        }

        let document;
        try {
            document = JSON.parse(await readFile(filePath, "utf8"));
        } catch (error) {
            throw new ProofFormatError(`证明文件不是有效 JSON: ${error.message}`);
        }

        const result = await verifyProof(document, { expectedRootHash });
        printCheck("Leaf Payload", result.checks.leafPayload);
        printCheck("Leaf Hash", result.checks.leafHash);
        printCheck("Merkle Root", result.checks.merkleRoot);
        printCheck("Published Root", result.checks.publishedRoot);
        console.log(`Calculated Root: ${result.calculatedRootHash}`);
        console.log(`File Root:       ${result.fileRootHash}`);

        if (expectedRootHash === undefined) {
            console.log("提示: 未提供 --root，仅验证文件内部一致性");
        }
        if (result.success) {
            console.log("验证成功 / Verification passed");
            return;
        }
        console.error("验证失败 / Verification failed");
        process.exitCode = 1;
    } catch (error) {
        console.error(`输入错误 / Invalid input: ${error.message}`);
        printUsage();
        process.exitCode = 2;
    }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
