#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OWNER = "BitbaseGlobal";
const REPO = "proof-of-reserves-verifier";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMIT_MESSAGE = [
    "Add Proof of Reserves Merkle proof verifier.",
    "",
    "Independent local verification for POR_V1 proofs with CLI and Web Crypto support."
].join("\n");

function getToken() {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (typeof token !== "string" || token.length === 0) {
        throw new Error("请设置环境变量 GITHUB_TOKEN（GitHub PAT，需 repo 权限）");
    }
    return token;
}

function formatGitHubError(status, apiPath, payload) {
    const message = typeof payload.message === "string" ? payload.message : JSON.stringify(payload);
    if (status === 403 && message.includes("Resource not accessible by personal access token")) {
        return [
            `${status} ${apiPath}: ${message}`,
            "",
            "Token 无法写入该组织仓库，请检查：",
            "1. 使用 Classic PAT，勾选 repo（完整仓库权限）",
            "2. 或 Fine-grained PAT：Repository access 选中 BitbaseGlobal/proof-of-reserves-verifier，",
            "   Permissions 至少 Contents=Read and write、Metadata=Read",
            "3. 组织启用 SSO 时，到 https://github.com/settings/tokens 对该 Token 点 Configure SSO 并授权 BitbaseGlobal",
            "4. 确认 BitbaseGlobal 组织已允许该 Token 访问（Org Settings → Personal access tokens）"
        ].join("\n");
    }
    return `${status} ${apiPath}: ${message}`;
}

async function githubRequest(token, method, apiPath, body) {
    const response = await fetch(`https://api.github.com${apiPath}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(body === undefined ? {} : { "Content-Type": "application/json" })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    if (response.ok === false) {
        let payload = {};
        try {
            payload = text.length === 0 ? {} : JSON.parse(text);
        } catch {
            payload = { message: text };
        }
        throw new Error(formatGitHubError(response.status, `${method} ${apiPath}`, payload));
    }
    return text.length === 0 ? null : JSON.parse(text);
}

async function assertTokenAccess(token) {
    const repo = await githubRequest(token, "GET", `/repos/${OWNER}/${REPO}`);
    if (repo.permissions?.push !== true && repo.permissions?.admin !== true) {
        throw new Error([
            `Token 能读取仓库，但没有 push 权限（push=${repo.permissions?.push ?? false}）。`,
            "请按上方 Token 配置说明重新生成并授权。"
        ].join("\n"));
    }
}

function listTrackedFiles() {
    return execSync("git ls-tree -r HEAD --name-only", {
        cwd: REPO_ROOT,
        encoding: "utf8"
    }).trim().split("\n").filter(Boolean);
}

async function main() {
    const token = getToken();
    const files = listTrackedFiles();
    console.log(`准备上传 ${files.length} 个文件到 ${OWNER}/${REPO} ...`);
    await assertTokenAccess(token);

    const ref = await githubRequest(token, "GET", `/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    const parentSha = ref.object.sha;
    console.log(`远程 main: ${parentSha}`);

    const blobEntries = [];
    for (const filePath of files) {
        const absolutePath = path.join(REPO_ROOT, filePath);
        const content = await readFile(absolutePath);
        const blob = await githubRequest(token, "POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
            content: content.toString("base64"),
            encoding: "base64"
        });
        blobEntries.push({
            path: filePath,
            mode: "100644",
            type: "blob",
            sha: blob.sha
        });
        console.log(`blob ${filePath}`);
    }

    const tree = await githubRequest(token, "POST", `/repos/${OWNER}/${REPO}/git/trees`, {
        tree: blobEntries
    });

    const commit = await githubRequest(token, "POST", `/repos/${OWNER}/${REPO}/git/commits`, {
        message: COMMIT_MESSAGE,
        tree: tree.sha,
        parents: [parentSha]
    });

    await githubRequest(token, "PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/main`, {
        sha: commit.sha
    });

    console.log(`推送成功: https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`);
}

main().catch((error) => {
    console.error(`推送失败: ${error.message}`);
    process.exitCode = 1;
});
