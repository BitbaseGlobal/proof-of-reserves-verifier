const ALGORITHM_VERSION = "POR_V1";
const CURRENCIES = ["BTC", "ETH", "USDT", "USDC"];
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const BALANCE_PATTERN = /^-?(?:0|[1-9]\d*)\.\d{8}$/;
const AUDIT_ID_PATTERN = /^[1-9]\d*$/;
const MAX_PROOF_LENGTH = 256;
const MAX_LEAF_PAYLOAD_LENGTH = 4096;

export class ProofFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = "ProofFormatError";
    }
}

function assertObject(value, field) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new ProofFormatError(`${field} 必须是对象`);
    }
}

function assertString(value, field, maxLength = 1024) {
    if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
        throw new ProofFormatError(`${field} 必须是长度 1-${maxLength} 的字符串`);
    }
}

function assertHash(value, field) {
    if (typeof value !== "string" || HASH_PATTERN.test(value) === false) {
        throw new ProofFormatError(`${field} 必须是 64 位小写十六进制 Hash`);
    }
}

function normalizeAuditId(value) {
    if (typeof value === "number") {
        if (Number.isSafeInteger(value) === false || value <= 0) {
            throw new ProofFormatError("auditId 必须是正安全整数");
        }
        return String(value);
    }
    if (typeof value === "string" && AUDIT_ID_PATTERN.test(value)) {
        return value;
    }
    throw new ProofFormatError("auditId 必须是正整数或正整数字符串");
}

function buildCanonicalLeafPayload(document) {
    if (document.version !== ALGORITHM_VERSION) {
        throw new ProofFormatError(`version 仅支持 ${ALGORITHM_VERSION}`);
    }
    const auditId = normalizeAuditId(document.auditId);
    assertHash(document.recordId, "recordId");
    assertObject(document.balances, "balances");

    const balanceParts = CURRENCIES.map((currency) => {
        const balance = document.balances[currency];
        if (typeof balance !== "string" || BALANCE_PATTERN.test(balance) === false) {
            throw new ProofFormatError(`${currency} 余额必须是保留 8 位小数的字符串`);
        }
        return `${currency}=${balance}`;
    });

    return `${ALGORITHM_VERSION}|auditId=${auditId}|recordId=${document.recordId}|${balanceParts.join("|")}`;
}

export async function sha256Hex(value) {
    assertString(value, "SHA-256 原文", MAX_LEAF_PAYLOAD_LENGTH * 2);
    if (globalThis.crypto?.subtle === undefined) {
        throw new ProofFormatError("当前运行环境不支持 Web Crypto SHA-256");
    }
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

export async function verifyProof(document, options = {}) {
    assertObject(document, "证明文件");
    assertString(document.leafPayload, "leafPayload", MAX_LEAF_PAYLOAD_LENGTH);
    assertHash(document.leafHash, "leafHash");
    assertHash(document.rootHash, "rootHash");
    if (Array.isArray(document.proof) === false || document.proof.length > MAX_PROOF_LENGTH) {
        throw new ProofFormatError(`proof 必须是长度不超过 ${MAX_PROOF_LENGTH} 的数组`);
    }

    const expectedRootHash = options.expectedRootHash;
    if (expectedRootHash !== undefined) {
        assertHash(expectedRootHash, "expectedRootHash");
    }

    const canonicalLeafPayload = buildCanonicalLeafPayload(document);
    const calculatedLeafHash = await sha256Hex(canonicalLeafPayload);
    let calculatedRootHash = calculatedLeafHash;

    for (let index = 0; index < document.proof.length; index += 1) {
        const node = document.proof[index];
        assertObject(node, `proof[${index}]`);
        assertHash(node.hash, `proof[${index}].hash`);
        if (node.position !== "LEFT" && node.position !== "RIGHT") {
            throw new ProofFormatError(`proof[${index}].position 仅支持 LEFT 或 RIGHT`);
        }
        const value = node.position === "LEFT"
            ? node.hash + calculatedRootHash
            : calculatedRootHash + node.hash;
        calculatedRootHash = await sha256Hex(value);
    }

    const checks = {
        leafPayload: document.leafPayload === canonicalLeafPayload,
        leafHash: document.leafHash === calculatedLeafHash,
        merkleRoot: document.rootHash === calculatedRootHash,
        publishedRoot: expectedRootHash === undefined
            ? null
            : expectedRootHash === calculatedRootHash && expectedRootHash === document.rootHash
    };
    const success = Object.values(checks).every((value) => value !== false);

    return {
        success,
        checks,
        calculatedLeafHash,
        calculatedRootHash,
        fileRootHash: document.rootHash,
        expectedRootHash: expectedRootHash ?? null
    };
}
